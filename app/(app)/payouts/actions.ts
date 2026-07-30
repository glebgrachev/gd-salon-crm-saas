"use server";

import { createClient } from "@/lib/supabase/server";

export type DetailRow = {
  booking_id: string;
  starts_at: string;
  service_name: string;
  client_name: string;
  amount: number;
  payout_type: string;
  payout_value: number;
  payout: number;
};

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

export async function fetchPayoutDetail(specialistId: string, from: string, to: string) {
  const g = await guard();
  if (!g) return { ok: false as const, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что специалист принадлежит этому салону
  const { data: specialist } = await supabase
    .from("specialists")
    .select("shop_id")
    .eq("id", specialistId)
    .single();

  if (!specialist || specialist.shop_id !== shopId) {
    return { ok: false as const, error: "Специалист не найден или не принадлежит вашему салону" };
  }

  const { data, error } = await supabase.rpc("payout_detail", {
    p_specialist: specialistId,
    p_from: from,
    p_to: to,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, rows: (data as DetailRow[]) ?? [] };
}