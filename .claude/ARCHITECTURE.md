# Architecture Deep Dive

> Technical details about how this codebase is structured

## Three-Tier Client Architecture

This project uses **three different Supabase client patterns** depending on execution context:

### 1. Server Components (`lib/supabase/server.ts`)

```typescript
import { createAuthClient } from "@/lib/supabase/server";

export default async function ServerComponent() {
  const auth = await createAuthClient();
  const { data } = await auth.getClaims();
  // ...
}
```

**Key Points:**
- Uses `@supabase/ssr` with Next.js cookies
- Returns **auth-only** interface (no `.from()` method)
- ⚠️ **NEVER store in global variable** - Fluid compute will break
- Create new client per function call
- Async function (awaits cookie store)

**Why Auth-Only?**
Encourages using Repository pattern instead of direct database queries.

### 2. Client Components (`lib/supabase/client.ts`)

```typescript
"use client";
import { createAuthClient } from "@/lib/supabase/client";

export default function ClientComponent() {
  const auth = createAuthClient();
  // Use for auth operations only
}
```

**Key Points:**
- Browser-based cookie handling
- Also returns **auth-only** interface
- Singleton pattern safe in browser
- Synchronous (no await needed)

### 3. Middleware (`lib/supabase/middleware.ts`)

```typescript
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}
```

**Key Points:**
- Refreshes auth session on every request
- **MUST call `getClaims()`** to prevent random logouts
- Redirects unauthenticated users
- Public routes: `/`, `/auth/*`

## Repository Pattern

### Core Abstraction

The repository pattern provides a type-safe abstraction over the `user_data` table:

```typescript
class Repository<T extends BaseClass<D>, D extends BaseData> {
  constructor(
    private supabase: SupabaseClient,
    private typeName: string,
    private classConstructor: new (data: D) => T,
    private version: number
  ) {}

  async save(document: T): Promise<void>
  async update(id: string, document: T): Promise<void>
  async get(id: string): Promise<T | null>
  async list(): Promise<T[]>
  async delete(id: string): Promise<void>
  async search(query: unknown): Promise<T[]>
}
```

### Two Repository Types

#### Repository (Many Documents)

For data types where users have **multiple** documents:

```typescript
const projectRepo = new Repository(
  supabase,
  'projects',          // type_name in database
  Project,             // Class constructor
  PROJECT_VERSION      // Schema version
);

// User can have many projects
await projectRepo.save(project1);
await projectRepo.save(project2);
const allProjects = await projectRepo.list();
```

#### SingletonRepository (One Document)

For data types where users have **one** document:

```typescript
const settingsRepo = new SingletonRepository(
  supabase,
  'user_settings',
  UserSettings,
  SETTINGS_VERSION,
  DEFAULT_SETTINGS    // Default if not exists
);

// User has one settings object
const settings = await settingsRepo.get();
await settingsRepo.save(updatedSettings);
```

### Document Classes

All documents extend `BaseClass<T>`:

```typescript
interface ProjectData extends BaseData {
  version: number;
  title: string;
  description: string;
  tasks: Task[];
  createdAt: Date;
}

class Project extends BaseClass<ProjectData> {
  static migrate(data: unknown): ProjectData {
    // Handle version migrations
  }

  // Immutable updates - return new instance
  updateTitle(title: string): Project {
    return new Project({
      ...this.data,
      title
    });
  }

  addTask(task: Task): Project {
    return new Project({
      ...this.data,
      tasks: [...this.data.tasks, task]
    });
  }
}
```

**Key Principles:**
- Immutable - updates create new instances
- Versioned - `migrate()` handles schema changes
- Type-safe - TypeScript enforces structure

## Migration Strategies

### Short-Term: Migrate on Read

```typescript
class Project extends BaseClass<ProjectData> {
  static migrate(data: unknown): ProjectData {
    const version = (data as any).version;

    switch (version) {
      case 1:
        return migrateV1toV2(data);
      case 2:
        return data as ProjectDataV2;
      default:
        throw new Error(`Unknown version: ${version}`);
    }
  }
}
```

**Benefits:**
- ✅ Zero downtime
- ✅ Instant deployment
- ✅ Gradual migration
- ⚠️ Slower reads (migration overhead)

### Long-Term: Bulk Migration

```typescript
// Run as GitHub Action with service role key
const { data } = await supabase
  .from('user_data')
  .select('*')
  .eq('type_name', 'projects')
  .eq('data->>version', '1');

for (const row of data) {
  const migrated = Project.migrate(row.data);
  await supabase
    .from('user_data')
    .update({ data: migrated })
    .eq('id', row.id);
}
```

**Benefits:**
- ✅ Fast reads (no migration overhead)
- ✅ Clean data
- ⚠️ Requires downtime or careful coordination

## Database Schema Details

### Single Table Design

```sql
CREATE TABLE user_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type_name TEXT NOT NULL,
  data JSONB NOT NULL,

  -- Generated columns for RLS
  public_read BOOLEAN GENERATED ALWAYS AS (
    COALESCE((data->>'publicRead')::boolean, false)
  ) STORED,

  public_update BOOLEAN GENERATED ALWAYS AS (
    COALESCE((data->>'publicUpdate')::boolean, false)
  ) STORED,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
-- Primary query pattern
CREATE INDEX idx_user_type
  ON user_data(user_id, type_name);

-- Public documents
CREATE INDEX idx_public_read
  ON user_data(public_read)
  WHERE public_read = true;

-- Type-based queries
CREATE INDEX idx_type
  ON user_data(type_name);

-- Recent changes
CREATE INDEX idx_updated
  ON user_data(updated_at DESC);
```

### Row Level Security (RLS)

```sql
-- Users read their own data
CREATE POLICY "Users can read own data"
  ON user_data FOR SELECT
  USING (auth.uid() = user_id);

-- Anyone can read public documents
CREATE POLICY "Anyone can read public data"
  ON user_data FOR SELECT
  USING (public_read = true);

-- Users can insert their own data
CREATE POLICY "Users can insert own data"
  ON user_data FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own data
CREATE POLICY "Users can update own data"
  ON user_data FOR UPDATE
  USING (auth.uid() = user_id);

-- Authenticated users can update public documents
CREATE POLICY "Authenticated users can update public data"
  ON user_data FOR UPDATE
  USING (auth.uid() IS NOT NULL AND public_update = true);

-- Users can delete their own data
CREATE POLICY "Users can delete own data"
  ON user_data FOR DELETE
  USING (auth.uid() = user_id);
```

## Sentry Integration

### Three Entry Points

1. **Server (`instrumentation.ts`)**
   ```typescript
   Sentry.init({
     dsn: "...",
     tracesSampleRate: 1.0,
     enableLogs: true,  // Console.log → Sentry
   });
   ```

2. **Client (`instrumentation-client.ts`)**
   ```typescript
   Sentry.init({
     dsn: "...",
     integrations: [
       Sentry.browserTracingIntegration(),
       Sentry.replayIntegration(),
     ],
   });
   ```

3. **Edge (`config/sentry/instrumentation.edge.config.ts`)**
   ```typescript
   Sentry.init({
     dsn: "...",
     // Runs in middleware
   });
   ```

### Usage Patterns

```typescript
// Error tracking
try {
  await dangerousOperation();
} catch (error) {
  Sentry.captureException(error);
  throw error;
}

// Performance monitoring
const result = await Sentry.startSpan(
  { name: 'database-query', op: 'db' },
  async () => {
    return await repo.list();
  }
);

// Logging (automatically sent to Sentry)
console.log("User signed in");  // Goes to Sentry
console.error("Auth failed");   // Goes to Sentry
```

## Next.js Configuration

### Sentry Wrapper

```typescript
export default withSentryConfig(nextConfig, {
  org: "kvs-development",
  project: "nextjs-supabase",

  // Upload source maps during build
  silent: !process.env.CI,

  // Tunnel Sentry requests through Next.js
  tunnelRoute: "/monitoring",

  // Hide Sentry from dev tools
  hideSourceMaps: true,

  // Disable Sentry logger in production
  disableLogger: true,

  // Vercel monitoring
  automaticVercelMonitors: true,
});
```

### Production Source Maps

```typescript
const nextConfig = {
  productionBrowserSourceMaps: true,  // Better Sentry errors
};
```

## Middleware Flow

```
Request → middleware.ts
  ↓
  updateSession(request)
    ↓
    Create Supabase client
    ↓
    getClaims() ← CRITICAL (prevents random logout)
    ↓
    Session valid?
      ├─ Yes → Continue to page
      └─ No  → Redirect to /auth/login
```

**Public Routes (no auth required):**
- `/`
- `/auth/login`
- `/auth/sign-up`
- `/auth/forgot-password`
- `/auth/confirm`
- `/auth/update-password`

## Component Patterns

### Server Component (Default)

```typescript
// No directive needed
export default async function ServerPage() {
  const auth = await createAuthClient();
  const { data } = await auth.getClaims();

  // Can fetch data directly
  const repo = new Repository(supabase, 'projects', Project, VERSION);
  const projects = await repo.list();

  return <div>{/* Render */}</div>;
}
```

### Client Component

```typescript
"use client";  // Required directive

import { useState } from "react";

export default function ClientComponent() {
  const [state, setState] = useState();

  // Can use hooks, event handlers, browser APIs
  return <button onClick={() => setState(...)}>Click</button>;
}
```

### When to Use Client Components

- Need React hooks (`useState`, `useEffect`, etc.)
- Event handlers (`onClick`, `onChange`, etc.)
- Browser APIs (`window`, `localStorage`, etc.)
- Third-party libraries requiring browser
- Animation/interaction

**Default to Server Components** - only use client when needed.

## Testing Architecture

### Playwright Configuration

```typescript
export default defineConfig({
  testDir: '../../tests',

  // Intentionally slow for reliability
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    slowMo: 200,  // 200ms delay between actions
  },

  // Retries on CI
  retries: process.env.CI ? 2 : 0,

  // Sequential on CI, parallel locally
  workers: process.env.CI ? 1 : undefined,
});
```

### Test Patterns

```typescript
test('navigation works', async ({ page }) => {
  await page.goto('/');

  // Wait for Next.js hydration (CI only)
  if (process.env.CI) {
    await page.waitForTimeout(2000);
  }

  await page.click('text=Sign in');
  await expect(page).toHaveURL(/auth\/login/);
});
```

### CI Integration

```yaml
# .github/workflows/playwright.yml
on:
  repository_dispatch:
    types: [vercel.deployment.success]

# Tests run against deployed Vercel preview URL
env:
  BASE_URL: ${{ github.event.client_payload.url }}
```

## Path Aliases

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

**Usage:**
```typescript
import { createAuthClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
```

## Styling System

### Tailwind + CSS Variables

```css
/* globals.css */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    /* ... */
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    /* ... */
  }
}
```

### Theme Switching

```typescript
import { ThemeProvider } from "next-themes";

<ThemeProvider attribute="class" defaultTheme="system">
  {children}
</ThemeProvider>
```

### shadcn/ui Components

```bash
# Add new components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dropdown-menu
```

Components are copied into `components/ui/` (not npm packages).

## Security Considerations

### RLS Policies

- All database access protected by Row Level Security
- Users can only access their own data
- Public documents opt-in via `publicRead`/`publicUpdate`
- Service role key bypasses RLS (use carefully)

### Auth Flow Security

- Email confirmation required for signup
- Password reset via secure email tokens
- Session refresh on every request
- Cookies are httpOnly and secure

### Environment Variables

```bash
# Public (exposed to browser)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY

# Private (server-only)
SUPABASE_SERVICE_ROLE_KEY  # Not included, add if needed
```

Never commit `.env.local` to git.

## Performance Optimizations

### Server Components

- Reduce JavaScript bundle size
- Fetch data close to database
- Better SEO and initial page load

### Turbopack

```bash
npm run dev --turbopack  # Fast refresh
```

### Source Maps

Production source maps enabled for better error debugging (small perf cost, worth it).

### Caching Strategy

Next.js automatic caching for:
- Server Component renders
- Data fetches
- Static assets

## Future Architectural Considerations

From `TODO.txt`:

1. **Search Functionality:** Consider adding full-text search indexes
2. **Real-time:** Supabase Realtime subscriptions
3. **File Upload:** Supabase Storage integration
4. **API Routes:** May need traditional API routes for webhooks
5. **Background Jobs:** Consider cron jobs or queue system
