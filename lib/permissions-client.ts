// lib/permissions-client.ts
import { createClient } from "@/lib/supabase/client";

export async function getShopModulesClient(shopId: number): Promise<Record<string, boolean>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}

export function hasModule(modules: Record<string, boolean> | null, key: string): boolean {
  if (!modules) return false;
  return modules[key] === true;
}