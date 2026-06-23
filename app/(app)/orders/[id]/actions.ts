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

export async function updateBookingStatus(
  id: string,
  status: BookingStatus,
) {
  if (!ALLOWED.includes(status)) {
    return { ok: false, error: "Недопустимый статус" };
  }

  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/orders/${id}`);
  revalidatePath("/");
  return { ok: true };
}
