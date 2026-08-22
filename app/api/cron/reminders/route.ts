import { createAdmin } from "@/lib/supabase/admin";
import { tgSend, fmtMsk, fmtTimeMsk } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  client_id: number;
  starts_at: string;
  ends_at: string;
  shop_id: number;
  service: { name: string } | null;
  specialist: { full_name: string } | null;
};

const SELECT =
  "id, client_id, starts_at, ends_at, shop_id, service:services ( name ), specialist:specialists ( full_name )";

type Admin = ReturnType<typeof createAdmin>;
type Mark = "reminded_day_at" | "reminded_3h_at" | "review_requested_at";

/**
 * Помечает запись как обработанную ДО отправки сообщения.
 */
async function claim(admin: Admin, id: string, field: Mark): Promise<boolean> {
  const { data, error } = await admin
    .from("bookings")
    .update({ [field]: new Date().toISOString() })
    .eq("id", id)
    .is(field, null)
    .select("id");

  if (error) {
    console.error(`reminders: не смогли пометить ${field} у ${id}:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createAdmin();
  
  // ✅ ИСПРАВЛЕНО: используем МСК (UTC+3)
  const nowUTC = new Date();
  // Текущее время в МСК (для сравнения с БД)
  const nowMSK = new Date(nowUTC.getTime() + 3 * 60 * 60 * 1000);
  
  console.log(`🕐 Текущее время: UTC=${nowUTC.toISOString()}, MSK=${nowMSK.toISOString()}`);

  const REMIND_H = 4;
  const CANCEL_H = 3;

  // ✅ Время для сравнения в МСК (переводим в UTC для сравнения с БД)
  // Напоминание за 24 часа: starts_at в интервале [сейчас+4ч, сейчас+24ч+4ч]
  const remindAtUTC = new Date(nowUTC.getTime() + REMIND_H * 3600_000);
  const in24hUTC = new Date(nowUTC.getTime() + (24 + REMIND_H) * 3600_000);
  const ago24hUTC = new Date(nowUTC.getTime() - 24 * 3600_000);

  let day = 0;
  let three = 0;
  let review = 0;

  const miniApp = process.env.MINIAPP_URL ?? "https://beauty-miniapp-saas.vercel.app";

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

  // ===== НАПОМИНАНИЕ ЗА СУТКИ =====
  // Записи, у которых starts_at в МСК = завтра (в интервале [сегодня+4ч, завтра+4ч])
  const { data: dayRows } = await admin
    .from("bookings")
    .select(SELECT)
    .in("status", ["new", "confirmed", "paid"])
    .eq("is_synthetic", false)
    .is("reminded_day_at", null)
    .gt("starts_at", remindAtUTC.toISOString())
    .lte("starts_at", in24hUTC.toISOString())
    .limit(50);
  
  console.log(`📅 Напоминания за сутки: найдено ${dayRows?.length ?? 0} записей`);
  
  for (const b of (dayRows as unknown as Row[]) ?? []) {
    if (!(await claim(admin, b.id, "reminded_day_at"))) continue;

    const botToken = await getBotToken(b.shop_id);
    if (!botToken) continue;

    await tgSend(
      b.client_id,
      `📅 Напоминание: завтра вы записаны\n\n` +
        `${b.service?.name ?? "Услуга"} · ${b.specialist?.full_name ?? ""}\n` +
        `🗓 ${fmtMsk(b.starts_at)}`,
      botToken,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Приду", web_app: { url: `${miniApp}/?startapp=confirm_${b.id}&shop_id=${b.shop_id}` } }],
          ],
        },
      },
    );
    day++;
  }

  // ===== НАПОМИНАНИЕ ЗА 4 ЧАСА =====
  // Записи, у которых starts_at в МСК в ближайшие 4 часа
  const { data: threeRows } = await admin
    .from("bookings")
    .select(SELECT)
    .in("status", ["new", "confirmed", "paid"])
    .eq("is_synthetic", false)
    .is("reminded_3h_at", null)
    .gt("starts_at", nowUTC.toISOString())
    .lte("starts_at", remindAtUTC.toISOString())
    .limit(50);
  
  console.log(`⏰ Напоминания за 4 часа: найдено ${threeRows?.length ?? 0} записей`);
  
  for (const b of (threeRows as unknown as Row[]) ?? []) {
    if (!(await claim(admin, b.id, "reminded_3h_at"))) continue;

    const botToken = await getBotToken(b.shop_id);
    if (!botToken) continue;

    const cancelUntil = new Date(new Date(b.starts_at).getTime() - CANCEL_H * 3600_000);
    const canStillCancel = cancelUntil.getTime() > nowUTC.getTime();

    await tgSend(
      b.client_id,
      `⏰ Сегодня в ${fmtTimeMsk(b.starts_at)} вы записаны\n\n` +
        `${b.service?.name ?? "Услуга"} · ${b.specialist?.full_name ?? ""}\n` +
        (canStillCancel
          ? `\nНе сможете прийти? Отменить можно до ${fmtTimeMsk(cancelUntil.toISOString())}.`
          : `Ждём вас! 💅`),
      botToken,
      canStillCancel
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Отменить запись", web_app: { url: `${miniApp}/?cancel=${b.id}&shop_id=${b.shop_id}` } }],
              ],
            },
          }
        : undefined,
    );
    three++;
  }

  // ===== ЗАПРОС ОТЗЫВА =====
  const { data: reviewRows } = await admin
    .from("bookings")
    .select(SELECT)
    .in("status", ["paid", "completed"])
    .eq("is_synthetic", false)
    .is("review_requested_at", null)
    .lte("ends_at", nowUTC.toISOString())
    .gt("ends_at", ago24hUTC.toISOString())
    .limit(50);
  
  console.log(`⭐ Запросы отзывов: найдено ${reviewRows?.length ?? 0} записей`);
  
  for (const b of (reviewRows as unknown as Row[]) ?? []) {
    if (!(await claim(admin, b.id, "review_requested_at"))) continue;

    const botToken = await getBotToken(b.shop_id);
    if (!botToken) continue;

    await tgSend(
      b.client_id,
      `Спасибо, что были у нас! 💖\n\n` +
        `Как прошёл визит — ${b.service?.name ?? "услуга"} у ${b.specialist?.full_name ?? "мастера"}? ` +
        `Будем благодарны за отзыв.`,
      botToken,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⭐ Оставить отзыв", web_app: { url: `${miniApp}/?review=${b.id}&shop_id=${b.shop_id}` } }],
          ],
        },
      },
    );
    review++;
  }

  console.log(`📊 Итог: день=${day}, 3ч=${three}, отзывы=${review}`);

  return new Response(JSON.stringify({ ok: true, day, three, review }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}