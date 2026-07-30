import { createClient } from "@/lib/supabase/server";
import OrdersClient from "./orders-client";
import type { OrderRow } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const SELECT = `
  id, starts_at, ends_at, status, price_snapshot, client_confirmed_at, created_at,
  reschedule_count, orig_starts_at, rescheduled_from, rescheduled_to,
  client:users ( telegram_id, first_name, last_name, username, phone ),
  specialist:specialists ( id, full_name ),
  service:services ( id, name )
`;

export default async function OrdersPage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем заказы ТОЛЬКО для этого салона
  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
    .order("starts_at", { ascending: false });

  return <OrdersClient initialOrders={(data as unknown as OrderRow[]) ?? []} />;
}