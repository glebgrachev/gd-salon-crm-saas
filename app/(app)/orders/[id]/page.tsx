import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderDetail from "./order-detail";
import type { OrderRow } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const SELECT = `
  id, starts_at, ends_at, status, price_snapshot, client_confirmed_at, created_at,
  shop_id,
  client:users ( telegram_id, first_name, last_name, username, phone, is_guest ),
  specialist:specialists ( id, full_name ),
  service:services ( id, name )
`;

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; time?: string }>;
}) {
  const { id } = await params;
  const { from, time } = await searchParams;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("id", id)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (!data) notFound();

  return <OrderDetail order={data as unknown as OrderRow} from={from || "table"} time={time || "all"} />;
}