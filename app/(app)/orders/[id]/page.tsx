import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderDetail from "./order-detail";
import type { OrderRow } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const SELECT = `
  id, starts_at, ends_at, status, price_snapshot, client_confirmed_at, created_at,
  shop_id,
  client:users ( telegram_id, first_name, last_name, username, phone ),
  specialist:specialists ( id, full_name ),
  service:services ( id, name )
`;

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем запись с проверкой shop_id
  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("id", id)
    .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
    .maybeSingle();

  if (!data) notFound();

  return <OrderDetail order={data as unknown as OrderRow} />;
}