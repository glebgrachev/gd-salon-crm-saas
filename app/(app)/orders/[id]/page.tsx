import { createClient } from "@/lib/supabase/server";
import OrdersClient from "../orders-client"; // ✅ Поднимаемся на уровень выше
import type { BookingStatus } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const SELECT = `
  id, status, starts_at, ends_at, created_at, 
  price_snapshot, shop_id, reschedule_count, orig_starts_at, rescheduled_to,
  service:services(name, duration_min, price), 
  specialist:specialists(full_name),
  client:users(telegram_id, first_name, last_name, username, phone, is_guest)
`;

async function updateBookingStatus(bookingId: string, newStatus: BookingStatus) {
  "use server";
  const supabase = await createClient();
  
  const { error } = await supabase
    .from("bookings")
    .update({ status: newStatus })
    .eq("id", bookingId);

  if (error) {
    console.error("❌ Ошибка обновления статуса:", error);
    throw new Error(error.message);
  }
}

export default async function OrdersPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <OrdersClient initialOrders={[]} shopId={0} onStatusChange={updateBookingStatus} />;
  }

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  const { data: orders } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("shop_id", shopId)
    .order("starts_at", { ascending: false });

  return (
    <OrdersClient
      initialOrders={orders ?? []}
      shopId={shopId}
      onStatusChange={updateBookingStatus}
    />
  );
}