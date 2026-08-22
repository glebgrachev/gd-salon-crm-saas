"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendReactivation } from "@/lib/retention";

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

/**
 * Отправить «спящему» клиенту сообщение-реактивацию ПРЯМО СЕЙЧАС.
 * Раньше кнопка лишь сбрасывала отметку, а сообщение уходило
 * авто-рассылкой в 9 утра — это сбивало с толку. Теперь шлём мгновенно.
 */
export async function sendReactivationNow(clientId: number) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что клиент принадлежит этому салону
  const { data: client } = await supabase
    .from("users")
    .select("shop_id")
    .eq("telegram_id", clientId)
    .single();

  if (!client || client.shop_id !== shopId) {
    return { ok: false, error: "Клиент не найден или не принадлежит вашему салону" };
  }

  // 👇 ПОЛУЧАЕМ ТОКЕН БОТА
  const admin = createAdmin();
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token")
    .eq("id", shopId)
    .single();

  if (shopError || !shop?.bot_token) {
    console.error('❌ sendReactivationNow: токен не найден для салона', shopId);
    return { ok: false, error: "Токен бота не найден" };
  }

  // берём имя и на сколько дней пропал — прямо из сегментов
  const { data: seg, error: segErr } = await supabase
    .from("v_client_segments")
    .select("client_id, days_since_last")
    .eq("client_id", clientId)
    .maybeSingle();

  if (segErr) return { ok: false, error: segErr.message };

  const { data: usr } = await supabase
    .from("users")
    .select("first_name, promo_opt_out")
    .eq("telegram_id", clientId)
    .maybeSingle();

  if (usr?.promo_opt_out) {
    return { ok: false, error: "Клиент отписался от рассылок" };
  }

  // ✅ ПЕРЕДАЁМ ТОКЕН
  const ok = await sendReactivation(
    clientId,
    usr?.first_name ?? null,
    seg?.days_since_last ?? null,
    shop.bot_token, // 👈 Передаем токен
  );

  if (!ok) {
    return {
      ok: false,
      error: "Telegram не принял сообщение. Возможно, клиент не открывал бота или заблокировал его.",
    };
  }

  // помечаем, чтобы авто-рассылка не продублировала
  await supabase
    .from("users")
    .update({ retention_notified_at: new Date().toISOString() })
    .eq("telegram_id", clientId);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/retention");
  return { ok: true };
}