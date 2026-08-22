"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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
  const { shopId } = g;

  const n = Math.round(Number(input.new_days));
  const r = Math.round(Number(input.regular_days));
  const l = Math.round(Number(input.lost_days));

  if (!(n > 0 && r > n && l > r)) {
    return { ok: false, error: "Пороги должны идти по возрастанию: Новый < Постоянный < Потерянный" };
  }

  const admin = createAdmin();

  // Ищем настройки для этого салона
  const { data: existing } = await admin
    .from("retention_settings")
    .select("id")
    .eq("shop_id", shopId)
    .maybeSingle();

  let result;

  if (existing) {
    // Обновляем существующие
    result = await admin
      .from("retention_settings")
      .update({
        new_days: n,
        regular_days: r,
        lost_days: l,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select();
  } else {
    // ✅ Вставляем НОВУЮ запись БЕЗ id (авто-генерация)
    result = await admin
      .from("retention_settings")
      .insert({
        shop_id: shopId,
        new_days: n,
        regular_days: r,
        lost_days: l,
        // id не указываем!
      })
      .select();
  }

  if (result.error) {
    console.error('❌ Ошибка сохранения настроек:', result.error);
    return { ok: false, error: result.error.message };
  }

  // Обновляем сегменты клиентов
  try {
    await admin.rpc('update_client_segments', { p_shop_id: shopId });
  } catch (error) {
    console.error('❌ Ошибка обновления сегментов:', error);
  }

  revalidatePath("/retention", "layout");
  revalidatePath("/clients", "layout");
  return { ok: true };
}