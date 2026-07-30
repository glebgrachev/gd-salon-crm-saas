"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

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

export async function updateLoyaltySettings(input: {
  cashback_percent: number;
  redeem_max_percent: number;
  point_value: number;
}) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

  const payload = {
    cashback_percent: clamp(input.cashback_percent, 0, 100),
    redeem_max_percent: clamp(input.redeem_max_percent, 0, 100),
    point_value: clamp(input.point_value, 0.01, 1000),
    updated_at: new Date().toISOString(),
    shop_id: shopId,
  };

  // Проверяем, что настройка принадлежит этому салону
  const { data: existing } = await supabase
    .from("loyalty_settings")
    .select("shop_id")
    .eq("id", 1)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Настройки не найдены или не принадлежат вашему салону" };
  }

  const { data, error } = await supabase
    .from("loyalty_settings")
    .update(payload)
    .eq("id", 1)
    .select();
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Строка настроек не найдена" };

  revalidatePath("/loyalty", "layout");
  return { ok: true };
}