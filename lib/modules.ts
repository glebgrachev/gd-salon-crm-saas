// lib/modules.ts
export type ModuleKey =
  | "analytics"
  | "loyalty"
  | "newsletters"
  | "retention"
  | "promotions"
  | "certificates"
  | "stock"
  | "waitlist"
  | "clients"
  | "bookings"
  | "specialists";

export function hasModule(
  modules: Record<string, any> | null | undefined,
  key: ModuleKey
): boolean {
  if (!modules) return false;
  const value = modules[key];
  // Модуль доступен, если: -1 (бесконечность), true, 1
  return value === -1 || value === true || value === 1;
}