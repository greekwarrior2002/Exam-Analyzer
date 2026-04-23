import { createClient } from "@supabase/supabase-js";

/**
 * Privileged client for server-side operations that must bypass RLS
 * (signed URLs for private storage, bulk ops). NEVER import from client code.
 * The service-role key grants full DB access — treat it like a root password.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
