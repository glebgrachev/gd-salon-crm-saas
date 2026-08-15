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
  newsletters: "/broadcasts",
  promotions: "/promotions",
  certificates: "/certificates",
  stock: "/stock",
  retention: "/retention",
  waitlist: "/waitlist",
};

export const MODULE_NAV: Record<ModuleKey, { href: string; label: string }> = {
  analytics: { href: "/analytics", label: "Аналитика" },
  loyalty: { href: "/loyalty", label: "Лояльность" },
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
  newsletters: "/broadcasts",
  promotions: "/promotions",
  certificates: "/certificates",
  stock: "/stock",
  retention: "/retention",
  waitlist: "/waitlist",
};

export const MODULE_NAV: Record<ModuleKey, { href: string; label: string }> = {
  analytics: { href: "/analytics", label: "Аналитика" },
  loyalty: { href: "/loyalty", label: "Лояльность" },
  broadcasts: { href: "/broadcasts", label: "Рассылки" },
  promotions: { href: "/promotions", label: "Акции" },
  certificates: { href: "/certificates", label: "Сертификаты" },
  stock: { href: "/stock", label: "Склад" },
  retention: { href: "/retention", label: "Удержание" },
  waitlist: { href: "/waitlist", label: "Лист ожидания" },
};

export function hasModule(modules: Record<string, boolean> | null, key: string): boolean {
  if (!modules) return false;
  return modules[key] === true;
}

export async function getShopModules(shopId: number): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}: { href: "/// lib/permissions.ts
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
  newsletters: "/broadcasts",
  promotions: "/promotions",
  certificates: "/certificates",
  stock: "/stock",
  retention: "/retention",
  waitlist: "/waitlist",
};

export const MODULE_NAV: Record<ModuleKey, { href: string; label: string }> = {
  analytics: { href: "/analytics", label: "Аналитика" },
  loyalty: { href: "/loyalty", label: "Лояльность" },
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
  newsletters: "/broadcasts",
  promotions: "/promotions",
  certificates: "/certificates",
  stock: "/stock",
  retention: "/retention",
  waitlist: "/waitlist",
};

export const MODULE_NAV: Record<ModuleKey, { href: string; label: string }> = {
  analytics: { href: "/analytics", label: "Аналитика" },
  loyalty: { href: "/loyalty", label: "Лояльность" },
  broadcasts: { href: "/broadcasts", label: "Рассылки" },
  promotions: { href: "/promotions", label: "Акции" },
  certificates: { href: "/certificates", label: "Сертификаты" },
  stock: { href: "/stock", label: "Склад" },
  retention: { href: "/retention", label: "Удержание" },
  waitlist: { href: "/waitlist", label: "Лист ожидания" },
};

export function hasModule(modules: Record<string, boolean> | null, key: string): boolean {
  if (!modules) return false;
  return modules[key] === true;
}

export async function getShopModules(shopId: number): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}: { href: "/broadcasts", label: "Рассылки" },
  promotions: { href: "/promotions", label: "Акции" },
  certificates: { href: "/certificates", label: "Сертификаты" },
  stock: { href: "/stock", label: "Склад" },
  retention: { href: "/retention", label: "Удержание" },
  waitlist: { href: "/waitlist", label: "Лист ожидания" },
};

export function hasModule(modules: Record<string, boolean> | null, key: string): boolean {
  if (!modules) return false;
  return modules[key] === true;
}

export async function getShopModules(shopId: number): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}", label: "Рассылки" },
  promotions: { href: "/promotions", label: "Акции" },
  certificates: { href: "/certificates", label: "Сертификаты" },
  stock: { href: "/stock", label: "Склад" },
  retention: { href: "/retention", label: "Удержание" },
  waitlist: { href: "/waitlist", label: "Лист ожидания" },
};

export function hasModule(modules: Record<string, boolean> | null, key: string): boolean {
  if (!modules) return false;
  return modules[key] === true;
}

export async function getShopModules(shopId: number): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();
  return data?.modules ?? {};
}