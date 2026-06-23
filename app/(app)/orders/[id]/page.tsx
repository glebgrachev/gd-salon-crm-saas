import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import OrderDetail from "./order-detail";
import type { OrderRow } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const SELECT = `
  id, starts_at, ends_at, status, price_snapshot, client_confirmed_at, created_at,
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

  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  return <OrderDetail order={data as unknown as OrderRow} />;
}
