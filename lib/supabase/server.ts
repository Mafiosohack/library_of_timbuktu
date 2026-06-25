import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cookie-bound server client using the ANON key.
 *
 * Use this in Server Components and Route Handlers when you want the request
 * to act AS THE LOGGED-IN USER. RLS policies are enforced, so this only ever
 * sees rows the authenticated user is allowed to see. This is the default
 * client for reads/writes on behalf of a user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` called from a Server Component — safe to ignore when
            // middleware is responsible for refreshing the session cookie.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. BYPASSES RLS. Server-side only, never expose to the
 * client. Use ONLY in API routes for privileged operations that the spec
 * requires the server to perform: generating signed Storage upload/download
 * URLs and writing AI summary drafts.
 *
 * Always authenticate/authorize the caller (via the cookie-bound client
 * above) BEFORE using this client to perform a privileged action.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
