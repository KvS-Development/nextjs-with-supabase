
## Features

- Works across the entire [Next.js](https://nextjs.org) stack
  - App Router
  - Pages Router
  - Middleware
  - Client
  - Server
- supabase-ssr. A package to configure Supabase Auth to use cookies
- Password-based authentication block installed via the [Supabase UI Library](https://supabase.com/ui/docs/nextjs/password-based-auth)
- Styling with [Tailwind CSS](https://tailwindcss.com)
- Components with [shadcn/ui](https://ui.shadcn.com/)
  - Environment variables automatically assigned to Vercel project

## Setup

The keys are automatically added to vercel if you add supabase storage to your vercel project.

For local development, also add keys to .env.local
Add project id to package.json for type generation if desired, but with the repository pattern the types on the supabase side should essentially not change.

This template comes with the default shadcn/ui style initialized. If you instead want other ui.shadcn styles, delete `components.json` and [re-install shadcn/ui](https://ui.shadcn.com/docs/installation/next)

### Environment variables

| Variable | Functionality |
| --- | --- |
| `SENTRY_DSN` | Enable Sentry error monitoring |
| `LOGTAIL_SOURCE_TOKEN` | Configure Logtail logging |
| `CYPRESS_RECORD_KEY` | Record Cypress tests to Cypress Cloud |
| `CHROMATIC_PROJECT_TOKEN` | Publish Storybook builds to Chromatic |

## More Supabase examples

- [Next.js Subscription Payments Starter](https://github.com/vercel/nextjs-subscription-payments)
