# Quick Reference

> Fast lookup for common patterns and code snippets

## Auth Patterns

### Get Current User (Server Component)

```typescript
import { createAuthClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const auth = await createAuthClient();
  const { data, error } = await auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  const userId = data.claims.sub;
  const email = data.claims.email;

  return <div>Hello {email}</div>;
}
```

### Sign Out

```typescript
"use client";
import { createAuthClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  const handleSignOut = async () => {
    const auth = createAuthClient();
    await auth.signOut();
    router.push("/auth/login");
  };

  return <button onClick={handleSignOut}>Sign Out</button>;
}
```

## Repository Pattern

### Define a New Data Type

```typescript
// 1. Define interface
interface ProjectData extends BaseData {
  version: typeof PROJECT_VERSION;
  title: string;
  description: string;
  tasks: Task[];
  createdAt: Date;
  publicRead?: boolean;  // Optional: allow public access
}

const PROJECT_VERSION = 1;

// 2. Create class
class Project extends BaseClass<ProjectData> {
  static migrate(data: unknown): ProjectData {
    // Handle future version migrations
    return data as ProjectData;
  }

  // 3. Add methods (immutable updates)
  updateTitle(title: string): Project {
    return new Project({
      ...this.data,
      title
    });
  }
}

// 4. Create repository instance
const getProjectRepo = () => {
  const supabase = createServerClient();  // Your Supabase client
  return new Repository(supabase, 'projects', Project, PROJECT_VERSION);
};
```

### CRUD Operations

```typescript
// CREATE
const project = new Project({
  version: 1,
  title: "My Project",
  description: "A cool project",
  tasks: [],
  createdAt: new Date(),
});
await repo.save(project);

// READ (single)
const project = await repo.get(projectId);

// READ (all)
const projects = await repo.list();

// UPDATE
const updated = project.updateTitle("New Title");
await repo.update(projectId, updated);

// DELETE
await repo.delete(projectId);

// SEARCH
const results = await repo.search({
  title: { $ilike: '%search%' }
});
```

### Singleton Data

```typescript
const DEFAULT_SETTINGS = {
  version: 1,
  theme: 'dark',
  notifications: true,
};

const getSettingsRepo = () => {
  const supabase = createServerClient();
  return new SingletonRepository(
    supabase,
    'user_settings',
    UserSettings,
    1,
    DEFAULT_SETTINGS
  );
};

// Always returns user's settings (or default)
const settings = await settingsRepo.get();
await settingsRepo.save(updatedSettings);
```

## Data Migration

### Version 1 → Version 2

```typescript
// Old version
interface ProjectV1 {
  version: 1;
  owner: string;
  title: string;
}

// New version
interface ProjectV2 {
  version: 2;
  members: string[];  // Changed from single owner
  title: string;
}

type ProjectVersions = ProjectV1 | ProjectV2;

class Project extends BaseClass<ProjectV2> {
  static migrate(data: unknown): ProjectV2 {
    const typed = data as ProjectVersions;

    switch (typed.version) {
      case 1:
        // Migrate v1 → v2
        return {
          version: 2,
          members: [typed.owner],  // Convert owner to members array
          title: typed.title,
        };

      case 2:
        // Already v2
        return typed;

      default:
        throw new Error(`Unknown version: ${typed.version}`);
    }
  }
}
```

## Supabase Clients

### Server Component

```typescript
import { createAuthClient } from "@/lib/supabase/server";

// Inside async component/function
const auth = await createAuthClient();
const { data } = await auth.getClaims();
```

### Client Component

```typescript
"use client";
import { createAuthClient } from "@/lib/supabase/client";

// Inside component
const auth = createAuthClient();
```

### Full Supabase Client (When Needed)

```typescript
import { createClient } from "@/lib/supabase/server";

// Returns full Supabase client (not recommended for general use)
const supabase = await createClient();
```

## Sentry Integration

### Error Tracking

```typescript
import * as Sentry from "@sentry/nextjs";

try {
  await riskyOperation();
} catch (error) {
  Sentry.captureException(error);
  console.error("Operation failed:", error);
  throw error;
}
```

### Performance Monitoring

```typescript
const result = await Sentry.startSpan(
  {
    name: 'fetch-user-projects',
    op: 'db.query',
  },
  async () => {
    return await projectRepo.list();
  }
);
```

### Custom Context

```typescript
Sentry.setContext("user", {
  id: userId,
  email: userEmail,
});

Sentry.captureMessage("User completed onboarding", "info");
```

## Component Patterns

### Protected Server Component

```typescript
import { createAuthClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
  const auth = await createAuthClient();
  const { data } = await auth.getClaims();

  if (!data?.claims) redirect("/auth/login");

  return <div>Protected content</div>;
}
```

### Client Component with Auth

```typescript
"use client";

import { createAuthClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";

export default function ProfileSettings() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    async function loadUser() {
      const auth = createAuthClient();
      const { data } = await auth.getUser();
      setUser(data.user);
    }
    loadUser();
  }, []);

  return <div>{user?.email}</div>;
}
```

### Form with Loading State

```typescript
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SaveButton() {
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await saveData();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handleSave} disabled={loading}>
      {loading ? "Saving..." : "Save"}
    </Button>
  );
}
```

## shadcn/ui Components

### Add Component

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add dropdown-menu
npx shadcn-ui@latest add dialog
```

### Use Component

```typescript
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Example() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Open</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Item 1</DropdownMenuItem>
        <DropdownMenuItem>Item 2</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Routing

### Navigation

```typescript
import { redirect } from "next/navigation";  // Server Component
import { useRouter } from "next/navigation";  // Client Component

// Server
redirect("/dashboard");

// Client
const router = useRouter();
router.push("/dashboard");
```

### Route Segments

```
app/
  page.tsx              → /
  about/page.tsx        → /about
  blog/[slug]/page.tsx  → /blog/hello-world
  (auth)/               → Grouping (no route)
```

### Dynamic Routes

```typescript
// app/blog/[slug]/page.tsx
export default async function BlogPost({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params;
  return <article>{slug}</article>;
}
```

## Database Queries

### Simple Query

```typescript
const projects = await repo.list();
```

### Search Query

```typescript
// Case-insensitive search
const results = await repo.search({
  title: { $ilike: '%keyword%' }
});

// Exact match
const results = await repo.search({
  status: 'active'
});
```

### Custom Query (Advanced)

```typescript
// If you need raw Supabase access
const supabase = await createClient();
const { data } = await supabase
  .from('user_data')
  .select('*')
  .eq('type_name', 'projects')
  .eq('user_id', userId)
  .eq('data->>status', 'active');  // JSONB query
```

## Environment Setup

### Required Variables

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### Optional Variables

```bash
# For Sentry source maps upload
SENTRY_AUTH_TOKEN=xxx

# For testing
BASE_URL=https://your-preview.vercel.app
```

## Common Commands

```bash
# Development
npm run dev                # Start dev server with Turbopack
npm run build              # Build for production
npm run start              # Run production build
npm run lint               # Run ESLint

# Testing
npm run test:e2e           # Run Playwright tests
npx playwright test --ui   # Run with UI
npx playwright test --debug # Run with debugger

# Supabase
npm run update-types       # Generate TypeScript types

# Database (via Supabase CLI)
supabase db push           # Push local migrations
supabase db reset          # Reset local database
```

## Debugging

### Server Component Logs

```typescript
console.log("Server:", data);  // Shows in terminal
```

### Client Component Logs

```typescript
console.log("Client:", data);  // Shows in browser console
```

### Sentry Breadcrumbs

```typescript
Sentry.addBreadcrumb({
  category: 'navigation',
  message: 'User navigated to dashboard',
  level: 'info',
});
```

### Network Requests

All auth requests go through Supabase. Check:
- Browser DevTools → Network tab
- Look for requests to `supabase.co`
- Check request/response headers and body

## TypeScript Tips

### Type Inference

```typescript
// Repository infers return type
const projects = await repo.list();  // Type: Project[]

// Manual type annotation if needed
const project: Project | null = await repo.get(id);
```

### Strict Null Checks

```typescript
const project = await repo.get(id);

if (!project) {
  return <div>Not found</div>;
}

// TypeScript knows project is non-null here
return <div>{project.data.title}</div>;
```

### Type Guards

```typescript
function isProjectV2(data: ProjectVersions): data is ProjectV2 {
  return data.version === 2;
}

if (isProjectV2(project)) {
  // TypeScript knows this is ProjectV2
  console.log(project.members);
}
```

## Performance Tips

1. **Use Server Components** - Default choice, faster
2. **Lazy Load Client Components** - Use `next/dynamic`
3. **Optimize Images** - Use `next/image`
4. **Add Indexes** - When queries slow down
5. **Monitor with Sentry** - Track slow operations

## Security Checklist

- ✅ All API routes check authentication
- ✅ RLS policies enabled on database
- ✅ Never expose service role key
- ✅ Validate user input
- ✅ Use HTTPS in production
- ✅ Keep dependencies updated
- ✅ Review Sentry errors regularly

## Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
git add .
git commit -m "Add new feature"

# Push to remote
git push -u origin feature/new-feature

# Create PR via GitHub UI or:
gh pr create --title "Add new feature" --body "Description"
```

## Deployment Checklist

- [ ] All tests passing
- [ ] Environment variables set in Vercel
- [ ] Supabase project configured
- [ ] Sentry project configured
- [ ] Database migrations applied
- [ ] Build succeeds locally
- [ ] No TypeScript errors
- [ ] No ESLint errors
