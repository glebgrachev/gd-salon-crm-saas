// lib/permissions-client.ts
import { createClient } from "@/lib/supabase/client";

export async function getShopModulesClient(shopId: number): Promise<Record<string, any>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}

export function hasModule(modules: Record<string, any> | null, key: string): boolean {
  if (!modules) return false;
  const value = modules[key];
  // -1, 1, true → true
  // 0, false, null → false
  return value !== 0 && value !== false && value !== null && value !== undefined;
}