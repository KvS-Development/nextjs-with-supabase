import { createBrowserClient } from "@supabase/ssr";

// Return only the auth interface to discourage direct data access
export function createAuthClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  ).auth;
}
