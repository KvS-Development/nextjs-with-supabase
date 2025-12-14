
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

## Sentry manual
These examples should be used as guidance when configuring Sentry functionality within a project.

### Exception Catching

Use `Sentry.captureException(error)` to capture an exception and log the error in Sentry.
Use this in try catch blocks or areas where exceptions are expected

### Tracing Examples

Spans should be created for meaningful actions within an applications like button clicks, API calls, and function calls
Use the `Sentry.startSpan` function to create a span
Child spans can exist within a parent span

#### Custom Span instrumentation in component actions

The `name` and `op` properties should be meaninful for the activities in the call.
Attach attributes based on relevant information and metrics from the request

```javascript
function TestComponent() {
  const handleTestButtonClick = () => {
    // Create a transaction/span to measure performance
    Sentry.startSpan(
      {
        op: "ui.click",
        name: "Test Button Click",
      },
      (span) => {
        const value = "some config";
        const metric = "some metric";

        // Metrics can be added to the span
        span.setAttribute("config", value);
        span.setAttribute("metric", metric);

        doSomething();
      },
    );
  };

  return (
    <button type="button" onClick={handleTestButtonClick}>
      Test Sentry
    </button>
  );
}
```

#### Custom span instrumentation in API calls

The `name` and `op` properties should be meaninful for the activities in the call.
Attach attributes based on relevant information and metrics from the request

```javascript
async function fetchUserData(userId) {
  return Sentry.startSpan(
    {
      op: "http.client",
      name: `GET /api/users/${userId}`,
    },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();
      return data;
    },
  );
}
```

### Logs

Where logs are used, ensure Sentry is imported using `import * as Sentry from "@sentry/nextjs"`
Enable logging in Sentry using `Sentry.init({ _experiments: { enableLogs: true } })`
Reference the logger using `const { logger } = Sentry`
Sentry offers a consoleLoggingIntegration that can be used to log specific console error types automatically without instrumenting the individual logger calls

#### Configuration

In NextJS the client side Sentry initialization is in `instrumentation-client.ts`, the server initialization is in `config/sentry/edge.config.ts` and the edge initialization is in `config/sentry/server.config.ts`
Initialization does not need to be repeated in other files, it only needs to happen the files mentioned above. You should use `import * as Sentry from "@sentry/nextjs"` to reference Sentry functionality

##### Baseline

```javascript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://9e1e6ee83a49f2e670d5d98510e3f94a@o4509886558633984.ingest.de.sentry.io/4509886560862288",

  _experiments: {
    enableLogs: true,
  },
});
```

##### Logger Integration

```javascript
Sentry.init({
  dsn: "https://9e1e6ee83a49f2e670d5d98510e3f94a@o4509886558633984.ingest.de.sentry.io/4509886560862288",
  integrations: [
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
  ],
});
```

#### Logger Examples

`logger.fmt` is a template literal function that should be used to bring variables into the structured logs.

```javascript
logger.trace("Starting database connection", { database: "users" });
logger.debug(logger.fmt`Cache miss for user: ${userId}`);
logger.info("Updated profile", { profileId: 345 });
logger.warn("Rate limit reached for endpoint", {
  endpoint: "/api/results/",
  isEnterprise: false,
});
logger.error("Failed to process payment", {
  orderId: "order_123",
  amount: 99.99,
});
logger.fatal("Database connection pool exhausted", {
  database: "users",
  activeConnections: 100,
});
```

## More Supabase examples

- [Next.js Subscription Payments Starter](https://github.com/vercel/nextjs-subscription-payments)
