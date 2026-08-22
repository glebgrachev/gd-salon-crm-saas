// lib/retention.ts

import { createAdmin } from "@/lib/supabase/admin";
import { tgSend } from "@/lib/notify";

const MINIAPP =
  process.env.MINIAPP_URL ?? "https://beauty-miniapp-saas.vercel.app";

/**
 * Сообщение-реактивация «спящему» клиенту.
 * Один и тот же текст шлёт и авто-рассылка (cron retention),
 * и кнопка «Отправить снова» в карточке клиента.
 * Возвращает true, если Telegram принял сообщение.
 */
export async function sendReactivation(
  clientId: number,
  firstName: string | null,
  daysSinceLast: number | null,
  botToken: string,
): Promise<boolean> {
  // 👇 ДОБАВЛЯЕМ ПРОВЕРКУ
  try {
    const admin = createAdmin();
    
    // Проверяем promo_opt_out
    const { data: user } = await admin
      .from("users")
      .select("promo_opt_out")
      .eq("telegram_id", clientId)
      .single();

    if (user?.promo_opt_out) {
      console.log(`⚠️ Клиент ${clientId} отписался от рассылок, пропускаем`);
      return false;
    }
  } catch (error) {
    console.error('❌ Ошибка проверки promo_opt_out:', error);
    // Продолжаем отправку, чтобы не блокировать из-за ошибки БД
  }

  const hello = firstName ? `${firstName}, ` : "";
  const days = daysSinceLast ?? 0;

  return tgSend(
    clientId,
    `💜 <b>Мы соскучились!</b>\n\n` +
      `${hello}давно не виделись — прошло ${days} дн. с вашего последнего визита.\n` +
      `Возвращайтесь, будем рады!`,
    botToken,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Записаться", web_app: { url: MINIAPP } }]],
      },
    },
  );
}