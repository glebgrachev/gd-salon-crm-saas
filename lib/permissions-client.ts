// lib/permissions-client.ts
import { createClient } from "@/lib/supabase/client";

export async function getShopModulesClient(shopId: number): Promise<{
  modules: Record<string, any>;
  subscriptionExpiresAt: string | null;
}> {
  const supabase = createClient();
  const { data } = await supabase
    .from("shops")
    .select("modules, subscription_expires_at")
    .eq("id", shopId)
    .single();
  
  return {
    modules: data?.modules ?? {},
    subscriptionExpiresAt: data?.subscription_expires_at ?? null,
  };
}

// Проверка активности подписки
export function isSubscriptionActive(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  
  const now = new Date();
  const expires = new Date(expiresAt);
  
  // Сравниваем в UTC
  const nowUTC = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    now.getUTCSeconds()
  );
  
  const expiresUTC = Date.UTC(
    expires.getUTCFullYear(),
    expires.getUTCMonth(),
    expires.getUTCDate(),
    expires.getUTCHours(),
    expires.getUTCMinutes(),
    expires.getUTCSeconds()
  );
  
  return expiresUTC > nowUTC;
}

export function hasModule(
  modules: Record<string, any> | null, 
  key: string,
  subscriptionExpiresAt?: string | null
): boolean {
  if (!modules) return false;
  
  // Проверяем подписку
  if (subscriptionExpiresAt !== undefined) {
    const isActive = isSubscriptionActive(subscriptionExpiresAt);
    if (!isActive) return false;
  }
  
  const value = modules[key];
  // -1, 1, true → true
  // 0, false, null → false
  return value !== 0 && value !== false && value !== null && value !== undefined;
}