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

export async function updateRetentionSettings(input: {
  new_days: number;
  regular_days: number;
  lost_days: number;
}) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const n = Math.round(Number(input.new_days));
  const r = Math.round(Number(input.regular_days));
  const l = Math.round(Number(input.lost_days));

  if (!(n > 0 && r > n && l > r)) {
    return { ok: false, error: "Пороги должны идти по возрастанию: Новый < Постоянный < Потерянный" };
  }

  // Проверяем, что настройка принадлежит этому салону
  const { data: existing } = await supabase
    .from("retention_settings")
    .select("shop_id")
    .eq("id", 1)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Настройки не найдены или не принадлежат вашему салону" };
  }

  const { data, error } = await supabase
    .from("retention_settings")
    .update({
      new_days: n,
      regular_days: r,
      lost_days: l,
      updated_at: new Date().toISOString(),
      shop_id: shopId,
    })
    .eq("id", 1)
    .select();
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Строка настроек не найдена" };

  revalidatePath("/retention", "layout");
  revalidatePath("/clients", "layout");
  return { ok: true };
}