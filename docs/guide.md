# TypeScript-First Database with Supabase

A pattern for treating your database as simple persistence for TypeScript objects, with migrations handled in application code.

## Core Concept

Instead of complex ORMs or database-first design, we:
1. Store everything as JSONB in a single `user_data` table
2. Define types in TypeScript with version numbers
3. Migrate data on-read (short term) or in bulk (long term)
4. Add database indexes only when performance demands it

## Setup

1. Run the SQL schema (see `supabase-schema.sql`)
2. Import the repository classes
3. Define your document types with migration logic
4. Start using it like any TypeScript object

## Migration Strategies

### Short-term: Migrate on Read

When you first deploy a schema change, documents are migrated as they're accessed:

```typescript
class ProjectDocument extends BaseDocument<ProjectData> {
  migrate(data: any): ProjectData {
    let migrated = data
    
    // V1 -> V2: Rename 'owner' to 'members' array
    if (!migrated.version || migrated.version === 1) {
      migrated = {
        ...migrated,
        version: 2,
        members: [migrated.owner],
        priority: 5, // add new field with default
        owner: undefined // remove old field
      }
    }
    
    // V2 -> V3: Add tags array
    if (migrated.version === 2) {
      migrated = {
        ...migrated,
        version: 3,
        tags: [] // new field with default
      }
    }
    
    return migrated as ProjectData
  }
}
```

**Pros:**
- Zero downtime
- Instant deployment
- Can rollback easily

**Cons:**
- Small performance hit on each read
- Old versions remain in database

### Long-term: Bulk Migration

After the new version has proven stable (days/weeks), run a bulk migration. Since RLS policies block access to other users' data, you need to use Supabase's service role key which bypasses RLS:

#### Create Migration Script

```typescript
// migrations/migrate-projects-v3.ts
import { createClient } from '@supabase/supabase-js'

async function bulkMigrateProjects() {
  // Service role key bypasses RLS - keep this SECRET!
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  // Get all old version documents
  const { data: oldDocs } = await supabaseAdmin
    .from('user_data')
    .select('id, data')
    .eq('type_name', 'projects')
    .lt('data->version', 3) // Less than current version
  
  console.log(`Found ${oldDocs?.length || 0} documents to migrate`)
  
  // Migrate in batches to avoid timeouts
  const batchSize = 100
  for (let i = 0; i < (oldDocs?.length || 0); i += batchSize) {
    const batch = oldDocs!.slice(i, i + batchSize)
    
    for (const doc of batch) {
      // Use your existing migration logic
      const migrated = new Project({} as any).migrate(doc.data)
      
      await supabaseAdmin
        .from('user_data')
        .update({ data: migrated })
        .eq('id', doc.id)
    }
    
    console.log(`Migrated batch ${i / batchSize + 1}`)
  }
  
  console.log('Migration complete!')
}

// Run if called directly
if (require.main === module) {
  bulkMigrateProjects()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
```

#### GitHub Action for Safe Migrations

```yaml
# .github/workflows/migrate.yml
name: Database Migrations

on:
  workflow_dispatch: # Manual trigger
    inputs:
      migration:
        description: 'Migration script to run'
        required: true
        type: choice
        options:
          - migrate-projects-v3
          - migrate-settings-v2
          - migrate-wiki-v2
      dry_run:
        description: 'Dry run (no changes)'
        type: boolean
        default: true

jobs:
  migrate:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: |
          npm install @supabase/supabase-js
          npm install -D tsx
      
      - name: Run migration (dry run)
        if: inputs.dry_run == true
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          DRY_RUN: true
        run: |
          echo "🔍 DRY RUN - No changes will be made"
          npx tsx migrations/${{ inputs.migration }}.ts
      
      - name: Run migration (real)
        if: inputs.dry_run == false
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: |
          echo "🚀 RUNNING MIGRATION FOR REAL"
          npx tsx migrations/${{ inputs.migration }}.ts
      
      - name: Send notification
        if: always()
        run: |
          echo "Migration ${{ inputs.migration }} completed with status: ${{ job.status }}"
          # Add Slack/Discord notification here if desired
```

#### Setup Instructions

1. **Add secrets to GitHub**:
   - Go to Settings → Secrets → Actions
   - Add `SUPABASE_URL` (your project URL)
   - Add `SUPABASE_SERVICE_ROLE_KEY` (from Supabase dashboard → Settings → API)

2. **Create migration script** in `migrations/` directory

3. **Run migration**:
   - Go to Actions tab in GitHub
   - Select "Database Migrations"
   - Click "Run workflow"
   - Choose migration and whether to dry run
   - Monitor the logs

#### Security Notes

⚠️ **NEVER commit the service role key to your repository**
⚠️ **NEVER use the service role key in client-side code**
⚠️ **ALWAYS test migrations on a staging database first**

The service role key bypasses ALL security - treat it like a database admin password.

After bulk migration, you can simplify your migrate function:

```typescript
migrate(data: any): ProjectData {
  if (data.version < 3) {
    // Should not happen after bulk migration
    console.error('Found unmigrated document:', data)
    throw new Error('Document version too old. Please contact support.')
  }
  return data as ProjectData
}
```

## Search Implementation

### Basic Search (ILIKE)

For simple substring matching, ILIKE works out of the box:

```typescript
// Search in repository
async search(searchTerm: string, fields: string[]) {
  const conditions = fields
    .map(field => `data->>'${field}' ILIKE '%${searchTerm}%'`)
    .join(' OR ')
  
  return await supabase
    .from('user_data')
    .select('*')
    .eq('type_name', this.typeName)
    .or(conditions)
}

// Usage
const results = await projectRepo.search('dashboard', ['title', 'description'])
```

**Performance:** Without index = slow. With index = fast enough for most uses.

### Adding Search Indexes

When search gets slow (usually 10k+ documents), add an index:

```sql
-- Basic index for a field
CREATE INDEX idx_projects_title 
  ON user_data((data->>'title')) 
  WHERE type_name = 'projects';

-- Case-insensitive index (for ILIKE)
CREATE INDEX idx_projects_title_lower 
  ON user_data(LOWER(data->>'title')) 
  WHERE type_name = 'projects';
```

### Full-Text Search

For Google-like search across multiple fields:

```sql
-- Add a generated column with search vector
ALTER TABLE user_data 
ADD COLUMN search_vector tsvector 
GENERATED ALWAYS AS (
  CASE 
    WHEN type_name = 'projects' THEN
      to_tsvector('english', 
        COALESCE(data->>'title', '') || ' ' || 
        COALESCE(data->>'description', '') || ' ' ||
        COALESCE(data->>'tags', '')
      )
    ELSE NULL
  END
) STORED;

-- Index it
CREATE INDEX idx_search_vector 
  ON user_data USING gin(search_vector);
```

Then search with:

```typescript
async fullTextSearch(query: string) {
  const { data } = await supabase
    .from('user_data')
    .select('*')
    .eq('type_name', 'projects')
    .textSearch('search_vector', query)
  
  return data
}

// Supports advanced queries
await fullTextSearch('dashboard & (react | vue)') // dashboard AND (react OR vue)
await fullTextSearch('dashboard -deprecated')      // dashboard NOT deprecated
```

### Fuzzy Search

For typo-tolerant search, you have options:

```sql
-- 1. Trigram similarity (best for typos)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_projects_title_trgm 
  ON user_data USING gin((data->>'title') gin_trgm_ops)
  WHERE type_name = 'projects';

-- Now you can search with similarity
SELECT * FROM user_data 
WHERE type_name = 'projects' 
  AND similarity(data->>'title', 'dashbord') > 0.3; -- finds 'dashboard'
```

```typescript
// In TypeScript
async fuzzySearch(searchTerm: string, field: string, threshold = 0.3) {
  const { data } = await supabase
    .rpc('fuzzy_search_projects', {
      search_term: searchTerm,
      field_name: field,
      threshold
    })
  
  return data
}
```

You'd need to create the RPC function:

```sql
CREATE OR REPLACE FUNCTION fuzzy_search_projects(
  search_term TEXT,
  field_name TEXT,
  threshold FLOAT DEFAULT 0.3
)
RETURNS SETOF user_data AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM user_data
  WHERE type_name = 'projects'
    AND similarity(data->>field_name, search_term) > threshold
  ORDER BY similarity(data->>field_name, search_term) DESC;
END;
$$ LANGUAGE plpgsql;
```

## Performance Guidelines

### When to Add Indexes

Monitor slow query logs. When you see queries taking >100ms consistently:

```sql
-- Check query performance
EXPLAIN ANALYZE 
SELECT * FROM user_data 
WHERE type_name = 'projects' 
  AND data->>'status' = 'active';

-- If slow, add index
CREATE INDEX idx_projects_status 
  ON user_data((data->>'status')) 
  WHERE type_name = 'projects';
```

### Index Strategies by Scale

| Documents | Strategy |
|-----------|----------|
| < 1,000 | No indexes needed |
| 1K - 10K | Index user_id + type_name |
| 10K - 100K | Add indexes for common queries |
| 100K - 1M | Consider generated columns |
| > 1M | Maybe use separate tables |

### Common Indexes to Add

```sql
-- For sorting by date
CREATE INDEX idx_projects_created 
  ON user_data(((data->>'createdAt')::timestamptz)) 
  WHERE type_name = 'projects';

-- For filtering by status
CREATE INDEX idx_projects_status 
  ON user_data((data->>'status')) 
  WHERE type_name = 'projects';

-- For user's recent items
CREATE INDEX idx_user_recent 
  ON user_data(user_id, type_name, updated_at DESC);
```

## Security Patterns

### Public Read

Documents with `publicRead: true` are readable by everyone:

```typescript
const publicProject = new ProjectDocument({
  // ...
  publicRead: true, // Anyone can read
  publicUpdate: false // Only owner can update
})
```

### Public Update

Documents with `publicUpdate: true` can be edited by any authenticated user:

```typescript
const wikiPage = new WikiPage({
  // ...
  publicRead: true,    // Anyone can read
  publicUpdate: true   // Any logged-in user can edit
})
```

### Private Documents

By default, documents are private to the user who created them:

```typescript
const privateDoc = new ProjectDocument({
  // ...
  // No publicRead or publicUpdate = private
})
```

### Team/Shared Access

For more complex sharing, add user IDs to your data:

```typescript
interface SharedDocument extends DatabaseStorable {
  version: 1
  typeName: 'shared_docs'
  sharedWith: string[] // user IDs
  // ...
}
```

Then add a custom RLS policy:

```sql
CREATE POLICY "Shared access" ON user_data
  FOR SELECT
  USING (
    auth.uid() = user_id 
    OR 
    auth.uid() = ANY(
      SELECT jsonb_array_elements_text(data->'sharedWith')::uuid
    )
  );
```

## Testing Migrations

Always test migrations before deploying:

```typescript
import { describe, it, expect } from 'vitest'

describe('ProjectDocument migrations', () => {
  const doc = new ProjectDocument({} as any)
  
  it('migrates v1 to current', () => {
    const v1Data = {
      title: 'Test Project',
      owner: 'user-123',
      description: 'Test'
    }
    
    const migrated = doc.migrate(v1Data)
    
    expect(migrated.version).toBe(3)
    expect(migrated.members).toEqual(['user-123'])
    expect(migrated.owner).toBeUndefined()
    expect(migrated.priority).toBe(5) // default value
    expect(migrated.tags).toEqual([]) // v3 addition
  })
  
  it('preserves current version', () => {
    const current = {
      version: 3,
      typeName: 'projects',
      title: 'Test',
      members: ['user-1'],
      description: 'Test',
      priority: 8,
      tags: ['important']
    }
    
    const migrated = doc.migrate(current)
    expect(migrated).toEqual(current)
  })
})
```

## Common Patterns

### Soft Delete

Instead of actually deleting, mark as deleted:

```typescript
interface SoftDeletable extends DatabaseStorable {
  deletedAt?: string
  deletedBy?: string
}

class Document extends BaseDocument<Data & SoftDeletable> {
  softDelete(userId: string): Document {
    return new Document({
      ...this.data,
      deletedAt: new Date().toISOString(),
      deletedBy: userId
    })
  }
  
  get isDeleted(): boolean {
    return !!this.data.deletedAt
  }
}

// Filter out deleted in queries
const activeDocs = await supabase
  .from('user_data')
  .select('*')
  .eq('type_name', 'documents')
  .is('data->deletedAt', null)
```

### Audit Trail

Track all changes:

```typescript
interface Auditable extends DatabaseStorable {
  createdBy: string
  createdAt: string
  modifiedBy: string
  modifiedAt: string
  changeHistory?: Array<{
    timestamp: string
    userId: string
    changes: Record<string, any>
  }>
}
```

### Drafts vs Published

```typescript
interface Publishable extends DatabaseStorable {
  status: 'draft' | 'published' | 'archived'
  publishedAt?: string
  publishedVersion?: any // snapshot of published data
}

class Article extends BaseDocument<ArticleData & Publishable> {
  publish(): Article {
    return new Article({
      ...this.data,
      status: 'published',
      publishedAt: new Date().toISOString(),
      publishedVersion: { ...this.data } // snapshot
    })
  }
}
```

## Debugging Tips

### Check What's Actually Stored

```typescript
// Raw query to see exact JSON
const { data } = await supabase
  .from('user_data')
  .select('data')
  .eq('id', documentId)
  .single()

console.log(JSON.stringify(data.data, null, 2))
```

### Monitor Migration Performance

```typescript
class Repository {
  async get(id: string) {
    const start = performance.now()
    
    const { data } = await supabase
      .from('user_data')
      .select('*')
      .eq('id', id)
      .single()
    
    const fetchTime = performance.now() - start
    
    const migrated = this.migrate(data.data)
    const migrateTime = performance.now() - start - fetchTime
    
    if (migrateTime > 10) {
      console.warn(`Slow migration: ${migrateTime}ms for document ${id}`)
    }
    
    return new this.DocumentClass(migrated)
  }
}
```

### Find Unmigrated Documents

```sql
-- Count documents by version
SELECT 
  type_name,
  data->>'version' as version,
  COUNT(*) as count
FROM user_data
GROUP BY type_name, data->>'version'
ORDER BY type_name, version;
```

## Limitations & When to Use Something Else

This pattern works great when:
- ✅ Your data is naturally document-shaped
- ✅ Most queries are "get user's items" or "get by ID"
- ✅ You value development speed over perfect optimization
- ✅ Your team knows TypeScript better than SQL

Consider alternatives when:
- ❌ You need complex relational queries (JOIN heavy)
- ❌ You need transactional consistency across documents
- ❌ You have strict performance SLAs requiring optimized schemas
- ❌ You need database-level constraints and validations

## Advanced: Adding Type Safety to Queries

For better type safety on dynamic queries:

```typescript
type WhereClause<T> = {
  [K in keyof T]?: T[K] | { operator: 'eq' | 'gt' | 'lt' | 'like'; value: T[K] }
}

class TypedRepository<TClass, TData> {
  async where(conditions: WhereClause<TData>) {
    let query = this.supabase
      .from('user_data')
      .select('*')
      .eq('type_name', this.typeName)
    
    for (const [field, condition of Object.entries(conditions)) {
      if (typeof condition === 'object' && 'operator' in condition) {
        // Complex condition
        switch (condition.operator) {
          case 'eq':
            query = query.eq(`data->${field}`, condition.value)
            break
          case 'gt':
            query = query.gt(`data->${field}`, condition.value)
            break
          // etc
        }
      } else {
        // Simple equality
        query = query.eq(`data->${field}`, condition)
      }
    }
    
    return query
  }
}

// Usage with full type safety
const highPriorityProjects = await projectRepo.where({
  status: 'active',
  priority: { operator: 'gt', value: 7 }
})
```

## Summary

This pattern lets you:
1. Write TypeScript-first, database-second
2. Deploy schema changes instantly
3. Migrate data safely without downtime
4. Add performance optimizations only when needed
5. Keep your codebase simple and maintainable

The database becomes what it should be: invisible infrastructure that just stores your objects and gets them back when you need them.