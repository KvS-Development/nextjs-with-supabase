# Project Overview: Next.js with Supabase

> **Last Updated:** 2026-01-04
> **Purpose:** Quick reference for Claude (and developers) to understand this codebase

## What This Project Is

A **Next.js 15 + Supabase** starter template with a unique **TypeScript-first database pattern**. Instead of traditional database migrations, this project:
- Stores all data as JSONB in a single `user_data` table
- Defines schemas in TypeScript classes with versioning
- Migrates data in application code (on-read or bulk)
- Uses Repository pattern to abstract all database operations

## Quick Start Commands

```bash
npm run dev              # Start dev server with Turbopack
npm run build            # Production build
npm run test:e2e         # Run Playwright tests
npm run update-types     # Generate Supabase types
```

## Tech Stack at a Glance

- **Framework:** Next.js 15.5.8 (App Router) + React 19
- **Database:** Supabase (PostgreSQL + Auth)
- **Styling:** Tailwind CSS + shadcn/ui components
- **Monitoring:** Sentry for errors and performance
- **Testing:** Playwright E2E tests
- **Deployment:** Vercel (with GitHub Actions)

## Architecture Philosophy

1. **Server Components First** - Default to server components, use client components only when needed
2. **TypeScript-First Database** - Schema lives in TypeScript, not SQL migrations
3. **Repository Pattern** - All database access through `Repository` or `SingletonRepository`
4. **Discourage Direct DB Access** - Supabase clients return auth-only interface
5. **Immutable Data Classes** - Documents update by creating new instances
6. **Sentry for Everything** - Error tracking, performance monitoring, and logging

## Key Files to Know

| File | Purpose |
|------|---------|
| `repository.ts` | Core repository pattern implementation |
| `middleware.ts` | Auth middleware (runs on every request) |
| `lib/supabase/server.ts` | Server-side Supabase auth client |
| `lib/supabase/client.ts` | Client-side Supabase auth client |
| `supabase-schema.sql` | Database schema (single table design) |
| `example-usage.ts` | Complete repository pattern examples |
| `type-safe-migrations.ts` | Migration pattern examples |

## Directory Structure

```
app/                    # Next.js App Router
  ├── auth/            # Authentication pages
  ├── protected/       # Protected pages (requires login)
  └── layout.tsx       # Root layout
components/            # React components
  ├── ui/             # shadcn/ui components
  └── [auth forms]    # Login, signup, etc.
lib/                  # Utilities
  └── supabase/       # Supabase client factories
config/               # Configuration
  ├── sentry/         # Sentry setup
  └── testing/        # Playwright config
supabase/             # Generated types
tests/                # E2E tests
```

## Important Patterns

### 1. Creating a Supabase Client (Server)

```typescript
// In Server Components or Server Actions
import { createAuthClient } from "@/lib/supabase/server";

const auth = await createAuthClient();
const { data } = await auth.getClaims();
```

**⚠️ NEVER store in global variable** (Fluid compute issue)

### 2. Using Repository Pattern

```typescript
// Multiple documents per user
const repo = new Repository(supabase, 'projects', Project, VERSION);
await repo.save(project);
const projects = await repo.list();

// Single document per user
const settingsRepo = new SingletonRepository(
  supabase,
  'user_settings',
  UserSettings,
  VERSION,
  defaultSettings
);
const settings = await settingsRepo.get();
```

### 3. Type-Safe Migrations

```typescript
interface DataV1 { version: 1; name: string }
interface DataV2 { version: 2; title: string; subtitle: string }

migrate(data: unknown): DataV2 {
  const v = data.version;
  if (v === 1) {
    return { version: 2, title: data.name, subtitle: '' };
  }
  return data as DataV2;
}
```

### 4. Protected Routes

```typescript
export default async function ProtectedPage() {
  const auth = await createAuthClient();
  const { data, error } = await auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  // User is authenticated
  const userId = data.claims.sub;
}
```

## Environment Variables

Required in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## Authentication Flow

1. **Sign Up:** `/auth/sign-up` → Email confirmation → Login
2. **Login:** `/auth/login` → Redirect to `/protected`
3. **Forgot Password:** `/auth/forgot-password` → Email → `/auth/update-password`
4. **Middleware:** Refreshes session on every request, redirects if not authenticated

## Testing

- **Framework:** Playwright with Chromium
- **Tests:** `tests/example.spec.ts`
- **CI:** GitHub Actions triggers tests on Vercel deployments
- **Note:** Tests intentionally slowed (200ms `slowMo`) for reliability

## Database Design

### Single Table Schema

```sql
CREATE TABLE user_data (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  type_name TEXT NOT NULL,      -- 'projects', 'settings', etc.
  data JSONB NOT NULL,           -- All data as JSON
  public_read BOOLEAN,           -- Generated from data
  public_update BOOLEAN,         -- Generated from data
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Why This Design?

- ✅ No database migrations needed
- ✅ Fast iteration on data structures
- ✅ Type safety in TypeScript
- ✅ Versioned data with migration logic
- ⚠️ Add indexes when performance requires

## Deployment

- **Platform:** Vercel
- **Automatic:** Push to main branch
- **Source Maps:** Enabled for Sentry
- **Monitoring:** Sentry integration

## Common Tasks

### Add a New Data Type

1. Define TypeScript interface with version
2. Create class extending `BaseClass`
3. Add migration logic
4. Create repository instance
5. Use in components

See `example-usage.ts` for complete examples.

### Add a New Page

1. Create in `app/` directory
2. Use Server Component by default
3. Add `"use client"` if interactivity needed
4. Protect with auth check if needed

### Add a New Component

1. Client components: Add `"use client"`
2. Server components: No directive needed
3. UI components: Use shadcn/ui patterns
4. Import with `@/` alias

## Future Improvements

See `TODO.txt` for planned enhancements.

## Resources

- **Setup Guide:** `readme-guide.md`
- **Database Pattern:** `Template.md`
- **Examples:** `example-usage.ts`
- **Migrations:** `type-safe-migrations.ts`
