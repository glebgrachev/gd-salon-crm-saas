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
  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .order("starts_at", { ascending: false });

  return <OrdersClient initialOrders={(data as unknown as OrderRow[]) ?? []} />;
}
