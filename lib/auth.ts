import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/lib/types";

export interface CurrentUser {
  id: string;
  email: string | null;
  role: Role;
}

/**
 * Resolves the authenticated user and their role from the cookie-bound
 * (RLS-respecting) Supabase client. Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: Role }>();

  return {
    id: user.id,
    email: user.email ?? null,
    // Default to the least-privileged role if the profile row is missing.
    role: profile?.role ?? "member",
  };
}

export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.role === "admin";
}
