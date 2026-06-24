import { createClient } from "@supabase/supabase-js";

// Только для серверных роутов. service_role обходит RLS — НИКОГДА не отдавать на клиент.
export function createAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
