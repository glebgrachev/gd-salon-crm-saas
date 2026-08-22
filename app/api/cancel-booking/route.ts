import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";
import { tgSend } from "@/lib/notify";
import { notifyBookingCancelled } from "@/lib/notify-admins"; // 👈 ДОБАВЛЯЕМ

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

const CANCEL_THRESHOLD_MS = 3 * 3600_000;
const ACTIVE = ["new", "confirmed", "paid"];

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    booking_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = body.shop_id;
  if (!shopId) {
    console.error('❌ shop_id не передан');
    return json({ error: "shop_id_required" }, 400);
  }

  const admin = createAdmin();

  // ===== 2. ПОЛУЧАЕМ ТОКЕН БОТА И ДАННЫЕ САЛОНА =====
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token, currency_id, currencies:symbol")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  // ===== 3. ПРОВЕРЯЕМ initData С ТОКЕНОМ САЛОНА =====
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  if (!body.booking_id) return json({ error: "bad_request" }, 400);

  const { data: booking } = await admin
    .from("bookings")
    .select("id, client_id, status, starts_at, service:services ( name ), specialist:specialists ( full_name )")
    .eq("id", body.booking_id)
    .maybeSingle();

  if (!booking) return json({ error: "not_found" }, 404);
  if (booking.client_id !== user.id) return json({ error: "forbidden" }, 403);
  if (!ACTIVE.includes(booking.status)) return json({ error: "not_cancelable" }, 400);
  if (new Date(booking.starts_at).getTime() - Date.now() < CANCEL_THRESHOLD_MS) {
    return json({ error: "too_late" }, 400);
  }

  // ===== ПОЛУЧАЕМ ИМЯ КЛИЕНТА =====
  const { data: client } = await admin
    .from("users")
    .select("first_name, last_name, username")
    .eq("telegram_id", user.id)
    .maybeSingle();

  const clientName = client 
    ? [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || client.username || "Клиент"
    : "Клиент";

  const serviceName = booking.service?.name ?? "Услуга";
  const specialistName = booking.specialist?.full_name ?? "Мастер";

  // ===== ОТМЕНЯЕМ ЗАПИСЬ =====
  const { error } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id);
  if (error) return json({ error: error.message }, 500);

  // ===== 🔥 УВЕДОМЛЕНИЕ КЛИЕНТУ =====
  const when = new Date(booking.starts_at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  });

  try {
    await tgSend(
      user.id,
      `❌ <b>Запись отменена</b>\n\n` +
        `${serviceName} · ${specialistName}\n` +
        `🗓 ${when}\n\n` +
        `Слот освобождён. Будем рады видеть вас снова! 💅`,
      shop.bot_token
    );
  } catch { /* noop */ }

  // ===== 🔥 УВЕДОМЛЕНИЕ АДМИНАМ ОБ ОТМЕНЕ =====
  try {
    await notifyBookingCancelled(Number(shopId), {
      service_name: serviceName,
      specialist_name: specialistName,
      starts_at: booking.starts_at,
      client_name: clientName,
    });
  } catch (error) {
    console.error('❌ Ошибка отправки уведомления админам:', error);
  }

  // слот освободился — сразу предлагаем его тем, кто ждёт в очереди
  notifyWaitlist();

  return json({ ok: true });
}

/** Дёргаем сканер очереди в фоне: ответ клиенту не ждёт рассылки */
function notifyWaitlist() {
  const url = process.env.NEXT_PUBLIC_CRM_URL ?? process.env.CRM_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return;

  void fetch(`${url}/api/cron/waitlist`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: "{}",
  }).catch(() => {
    /* плановый cron всё равно подхватит */
  });
}