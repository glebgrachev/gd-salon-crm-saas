"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { BookingStatus } from "@/lib/bookings";

const ALLOWED: BookingStatus[] = [
  "new",
  "confirmed",
  "completed",
  "paid",
  "cancelled",
  "no_show",
];

// 🔥 Расширенный guard — возвращает supabase + shopId
async function guard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user.id)
    .single();

  if (!admin?.shop_id) return null;

  return { supabase, shopId: admin.shop_id };
}

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
) {
  if (!ALLOWED.includes(status)) {
    return { ok: false, error: "Недопустимый статус" };
  }

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что запись принадлежит этому салону
  const { data: booking } = await supabase
    .from("bookings")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!booking || booking.shop_id !== shopId) {
    return { ok: false, error: "Запись не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/orders/${id}`);
  revalidatePath("/");
  return { ok: true };
}