import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import OrdersClient from "./orders-client";
import type { OrderRow, BookingStatus } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const SELECT = `
  id, starts_at, ends_at, status, price_snapshot, client_confirmed_at, created_at,
  reschedule_count, orig_starts_at, rescheduled_from, rescheduled_to,
  client:users ( telegram_id, first_name, last_name, username, phone, is_guest ),
  specialist:specialists ( id, full_name ),
  service:services ( id, name )
`;

// 👇 Server Action для обновления статуса
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

  // 1. Получаем пользователя
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Проверяем, является ли пользователь суперадмином
  const { data: isSuperAdmin } = await supabase.rpc("is_superadmin");

  // 3. Если суперадмин → редирект на /superadmin
  if (isSuperAdmin) {
    redirect("/superadmin");
  }

  // 4. Получаем shop_id для обычного админа
  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 5. Загружаем заказы ТОЛЬКО для этого салона
  const { data } = await supabase
    .from("bookings")
    .select(SELECT)
    .eq("shop_id", shopId)
    .order("starts_at", { ascending: false });

  return (
    <OrdersClient
      initialOrders={(data as unknown as OrderRow[]) ?? []}
      shopId={shopId}
      onStatusChange={updateBookingStatus}
    />
  );
}