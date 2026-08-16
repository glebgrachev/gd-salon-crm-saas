// lib/permissions.ts
import { createClient } from "@/lib/supabase/server";

export type ModuleKey = 
  | "analytics"
  | "loyalty"
  | "newsletters"
  | "promotions"
  | "certificates"
  | "stock"
  | "retention"
  | "waitlist";

export const MODULE_PATHS: Record<ModuleKey, string> = {
  analytics: "/analytics",
  loyalty: "/loyalty",
  newsletters: "/mailing", // 👈 Меняем с "/broadcasts" на "/mailing"
  promotions: "/promotions",
  certificates: "/certificates",
  stock: "/stock",
  retention: "/retention",
  waitlist: "/waitlist",
};

export const MODULE_NAV: Record<ModuleKey, { href: string; label: string }> = {
  analytics: { href: "/analytics", label: "Аналитика" },
  loyalty: { href: "/loyalty", label: "Лояльность" },
  newsletters: { href: "/mailing", label: "Рассылки" }, // 👈 Меняем с "/broadcasts" на "/mailing"
  promotions: { href: "/promotions", label: "Акции" },
  certificates: { href: "/certificates", label: "Сертификаты" },
  stock: { href: "/stock", label: "Склад" },
  retention: { href: "/retention", label: "Удержание" },
  waitlist: { href: "/waitlist", label: "Лист ожидания" },
};

export function hasModule(modules: Record<string, any> | null, key: string): boolean {
  if (!modules) return false;
  const value = modules[key];
  // -1, 1, true → true
  // 0, false, null → false
  return value !== 0 && value !== false && value !== null && value !== undefined;
}

export async function getShopModules(shopId: number): Promise<Record<string, any>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}