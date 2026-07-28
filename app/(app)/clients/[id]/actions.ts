"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { sendReactivation } from "@/lib/retention";

/**
 * Отправить «спящему» клиенту сообщение-реактивацию ПРЯМО СЕЙЧАС.
 * Раньше кнопка лишь сбрасывала отметку, а сообщение уходило
 * авто-рассылкой в 9 утра — это сбивало с толку. Теперь шлём мгновенно.
 */
export async function sendReactivationNow(clientId: number) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();

  // берём имя и на сколько дней пропал — прямо из сегментов
  const { data: seg, error: segErr } = await admin
    .from("v_client_segments")
    .select("client_id, days_since_last")
    .eq("client_id", clientId)
    .maybeSingle();

  if (segErr) return { ok: false, error: segErr.message };

  const { data: usr } = await admin
    .from("users")
    .select("first_name, promo_opt_out")
    .eq("telegram_id", clientId)
    .maybeSingle();

  if (usr?.promo_opt_out) {
    return { ok: false, error: "Клиент отписался от рассылок" };
  }

  const ok = await sendReactivation(
    clientId,
    usr?.first_name ?? null,
    seg?.days_since_last ?? null,
  );

  if (!ok) {
    return {
      ok: false,
      error: "Telegram не принял сообщение. Возможно, клиент не открывал бота или заблокировал его.",
    };
  }

  // помечаем, чтобы авто-рассылка не продублировала
  await admin
    .from("users")
    .update({ retention_notified_at: new Date().toISOString() })
    .eq("telegram_id", clientId);

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/retention");
  return { ok: true };
}
