import { createClient } from "@/lib/supabase/server";
import StockClient from "./stock-client";
import type { ProductRow, SupplierRow, ConsumableRow } from "./actions";

export const dynamic = "force-dynamic";

export type SvcOpt = { id: string; name: string };
export type SpecOpt = { id: string; full_name: string };
export type ClientOpt = { telegram_id: number; name: string };

export default async function StockPage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем данные ТОЛЬКО для этого салона
  const [
    { data: products },
    { data: suppliers },
    { data: services },
    { data: consumables },
    { data: specialists },
    { data: clients },
  ] = await Promise.all([
    supabase
      .from("v_products")
      .select("*")
      .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
      .order("kind", { ascending: false })
      .order("name"),
    supabase
      .from("suppliers")
      .select("*")
      .eq("is_active", true)
      .eq("shop_id", shopId) // 👈 ФИЛЬТР ПО САЛОНУ
      .order("name"),
    supabase
      .from("services")
      .select("id, name")
      .eq("shop_id", shopId) // 👈 ФИЛЬТР ПО САЛОНУ
      .order("name"),
    supabase
      .from("service_consumables")
      .select("service_id, product_id, qty_base")
      .eq("shop_id", shopId), // 👈 ФИЛЬТР ПО САЛОНУ
    supabase
      .from("specialists")
      .select("id, full_name")
      .eq("shop_id", shopId) // 👈 ФИЛЬТР ПО САЛОНУ
      .order("full_name"),
    supabase
      .from("users")
      .select("telegram_id, first_name, last_name, username")
      .eq("shop_id", shopId) // 👈 ФИЛЬТР ПО САЛОНУ
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  type RawClient = {
    telegram_id: number;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
  };

  const clientOpts: ClientOpt[] = ((clients as RawClient[]) ?? []).map((c) => ({
    telegram_id: c.telegram_id,
    name:
      [c.first_name, c.last_name].filter(Boolean).join(" ") ||
      (c.username ? `@${c.username}` : `ID ${c.telegram_id}`),
  }));

  return (
    <StockClient
      products={(products as ProductRow[]) ?? []}
      suppliers={(suppliers as SupplierRow[]) ?? []}
      services={(services as SvcOpt[]) ?? []}
      consumables={(consumables as ConsumableRow[]) ?? []}
      specialists={(specialists as SpecOpt[]) ?? []}
      clients={clientOpts}
    />
  );
}