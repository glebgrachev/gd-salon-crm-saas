import { tgSend } from "@/lib/notify";

const MINIAPP =
  process.env.MINIAPP_URL ?? "https://beauty-miniapp-tawny.vercel.app";

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
): Promise<boolean> {
  const hello = firstName ? `${firstName}, ` : "";
  const days = daysSinceLast ?? 0;

  return tgSend(
    clientId,
    `💜 <b>Мы соскучились!</b>\n\n` +
      `${hello}давно не виделись — прошло ${days} дн. с вашего последнего визита.\n` +
      `Возвращайтесь, будем рады!`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Записаться", web_app: { url: MINIAPP } }]],
      },
    },
  );
}
