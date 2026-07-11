import { createAdmin } from "@/lib/supabase/admin";
import { tgSend } from "@/lib/notify";

export const SYNC_LIMIT = 50; // до 50 получателей отправляем синхронно
export const WORKER_BATCH = 200; // сколько pending разгребаем за один тик воркера

export function buildReplyMarkup(broadcastId: string, cta_url: string | null) {
  const miniApp = process.env.MINIAPP_URL ?? "https://beauty-miniapp-tawny.vercel.app";
  const buttons: Array<Array<Record<string, unknown>>> = [];
  if (cta_url) {
    buttons.push([{ text: "Открыть", web_app: { url: cta_url } }]);
  } else {
    buttons.push([{ text: "Записаться", web_app: { url: miniApp } }]);
  }
  buttons.push([{ text: "Отписаться от рассылок", web_app: { url: `${miniApp}/?unsub=${broadcastId}` } }]);
  return { inline_keyboard: buttons };
}

export async function sendBatch(
  admin: ReturnType<typeof createAdmin>,
  broadcastId: string,
  clientIds: number[],
  text: string,
  cta_url: string | null,
) {
  const reply_markup = buildReplyMarkup(broadcastId, cta_url);
  for (const cid of clientIds) {
    const ok = await tgSend(cid, text, { reply_markup });
    if (ok) {
      await admin
        .from("broadcast_recipients")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("broadcast_id", broadcastId)
        .eq("client_id", cid);
    } else {
      await admin
        .from("broadcast_recipients")
        .update({ status: "failed", error: "tg_send_failed" })
        .eq("broadcast_id", broadcastId)
        .eq("client_id", cid);
    }
  }
}
