import { createAdmin } from "@/lib/supabase/admin";
import { tgSend, fmtMsk } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Offer = {
  id: string;
  client_id: number;
  slot: string;
  expires_at: string;
  ttl_min: number;
  service_id: string;
  specialist_id: string;
  service_name: string;
  specialist_name: string;
  shop_id: number; // 👈 Добавляем shop_id
};

/**
 * Сканирует очередь: гасит протухшее, раздаёт предложения освободившихся слотов.
 * Первому в очереди даётся 30 минут. Не успел — слот уходит следующему.
 * Дёргается pg_cron каждые 5 минут, а также сразу после отмены записи.
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdmin();
  const { data, error } = await admin.rpc("waitlist_scan");

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const res = data as { ok: boolean; offers: Offer[]; burned: number; stale: number };
  const offers = res.offers ?? [];

  const botName = process.env.NEXT_PUBLIC_BOT_NAME ?? "beautyapp_salon_bot";
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "app";

  // ===== КЭШ ТОКЕНОВ ДЛЯ САЛОНОВ =====
  const tokenCache = new Map<number, string>();

  async function getBotToken(shopId: number): Promise<string | null> {
    if (tokenCache.has(shopId)) return tokenCache.get(shopId)!;
    
    const { data: shop, error } = await admin
      .from("shops")
      .select("bot_token")
      .eq("id", shopId)
      .maybeSingle();
    
    if (error || !shop?.bot_token) {
      console.error(`❌ Токен для салона ${shopId} не найден`);
      return null;
    }
    
    tokenCache.set(shopId, shop.bot_token);
    return shop.bot_token;
  }

  let sent = 0;

  for (const o of offers) {
    // Получаем токен для салона
    const botToken = await getBotToken(o.shop_id);
    if (!botToken) continue;

    // deep-link открывает Mini App сразу на нужном слоте
    const link = `https://t.me/${botName}/${appName}?startapp=wl_${o.id}`;

    const text =
      `🔔 <b>Освободилось время!</b>\n\n` +
      `Вы ждали запись — место появилось:\n\n` +
      `💇 ${o.service_name}\n` +
      `👤 ${o.specialist_name}\n` +
      `🕐 ${fmtMsk(o.slot)}\n\n` +
      `⏳ Место придержим <b>${o.ttl_min} минут</b>. ` +
      `Успейте записаться, иначе оно уйдёт следующему в очереди.`;

    try {
      await tgSend(
        o.client_id,
        text,
        botToken, // 👈 ПЕРЕДАЁМ ТОКЕН
        {
          reply_markup: {
            inline_keyboard: [[{ text: "Записаться", url: link }]],
          },
        }
      );
      sent += 1;
    } catch {
      /* клиент мог заблокировать бота — не роняем рассылку */
    }
  }

  return Response.json({
    ok: true,
    offers: offers.length,
    sent,
    burned: res.burned,
    stale: res.stale,
  });
}