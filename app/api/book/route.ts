import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { priceService } from "@/lib/pricing";
import { json, options } from "@/lib/cors";
import { tgSend } from "@/lib/notify";
import { notifyNewBooking } from "@/lib/notify-admins"; // 👈 ДОБАВЛЯЕМ

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    service_id?: string;
    specialist_id?: string;
    starts_at?: string;
    points?: number;
    cert?: number;
    cert_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // 1. Получаем shop_id из запроса
  const shopId = body.shop_id;
  if (!shopId) {
    console.error('❌ shop_id не передан');
    return json({ error: "shop_id_required" }, 400);
  }

  // 2. Создаём админ-клиент
  const admin = createAdmin();

  // 3. Получаем токен бота и валюту из таблицы shops по shop_id
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token, currency_id, currencies:symbol")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  const currencySymbol = shop.currencies?.symbol || '₽';

  // 4. Проверяем initData с токеном салона
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  // ===== 🔥 ПРОВЕРКА НА ЗАМОРОЗКУ =====
  const { data: userData, error: userError } = await admin
    .from("users")
    .select("frozen")
    .eq("telegram_id", user.id)
    .maybeSingle();

  if (!userError && userData?.frozen === true) {
    console.warn('⚠️ Попытка записи замороженным пользователем:', user.id);
    try {
      await tgSend(
        user.id,
        '🔒 Функционал приложения временно ограничен.\n\nПожалуйста, обратитесь к администратору салона.',
        shop.bot_token
      );
    } catch {}
    return json({ 
      ok: false, 
      error: 'frozen',
      message: 'Функционал приложения временно ограничен. Пожалуйста, обратитесь к администратору салона.'
    }, 403);
  }

  const { service_id, specialist_id, starts_at } = body;
  if (!service_id || !specialist_id || !starts_at) return json({ error: "bad_request" }, 400);

  // длительность услуги
  const { data: svc } = await admin
    .from("services")
    .select("duration_min, name")
    .eq("id", service_id)
    .eq("shop_id", Number(shopId))
    .maybeSingle();
  if (!svc) return json({ error: "service_not_found" }, 400);

  // цена (авторитетно на сервере)
  const priced = await priceService(admin, service_id, specialist_id);
  if ("error" in priced) return json(priced, 400);

  // клиент (создаём/обновляем)
  await admin.from("users").upsert(
    {
      telegram_id: user.id,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      username: user.username ?? null,
      shop_id: Number(shopId),
    },
    { onConflict: "telegram_id" },
  );

  const start = new Date(starts_at);
  if (isNaN(start.getTime())) return json({ error: "bad_time" }, 400);
  const end = new Date(start.getTime() + svc.duration_min * 60000);

  // применение баллов
  const reqPoints = Math.max(0, Math.floor(Number(body.points ?? 0)));
  let redeem = 0;
  let pointValue = 1;
  if (reqPoints > 0) {
    const [{ data: cfg }, { data: acc }] = await Promise.all([
      admin.from("loyalty_settings").select("redeem_max_percent, point_value").eq("id", 1).maybeSingle(),
      admin.from("loyalty_accounts").select("balance").eq("client_id", user.id).maybeSingle(),
    ]);
    pointValue = Number(cfg?.point_value ?? 1) || 1;
    const maxPct = Number(cfg?.redeem_max_percent ?? 0);
    const maxByPct = Math.floor((priced.final_price * maxPct) / 100 / pointValue);
    const balance = Number(acc?.balance ?? 0);
    redeem = Math.max(0, Math.min(reqPoints, maxByPct, balance));
  }
  const afterPoints = Math.max(0, priced.final_price - redeem * pointValue);

  // применение сертификата
  const reqCert = Math.max(0, Math.floor(Number(body.cert ?? 0)));
  const certId = body.cert_id ?? null;
  let cert = 0;
  let certIdToStore: string | null = null;
  if (reqCert > 0 && certId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: crow } = await admin
      .from("certificates")
      .select("id, balance, status, expires_at")
      .eq("id", certId)
      .eq("activated_by", user.id)
      .maybeSingle();
    const notExpired = !crow?.expires_at || crow.expires_at >= today;
    if (crow && crow.status === "active" && notExpired && Number(crow.balance) > 0) {
      cert = Math.max(0, Math.min(reqCert, Number(crow.balance), afterPoints));
      if (cert > 0) certIdToStore = crow.id;
    }
  }
  const moneyDue = Math.max(0, afterPoints - cert);

  // заказ
  const { data: order, error: oErr } = await admin
    .from("orders")
    .insert({
      client_id: user.id,
      shop_id: Number(shopId),
      subtotal: priced.full_price,
      discount_total: priced.discount_amount,
      total: priced.final_price,
    })
    .select("id")
    .single();
  if (oErr || !order) return json({ error: oErr?.message ?? "order_failed" }, 500);

  // запись (бронь)
  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      order_id: order.id,
      client_id: user.id,
      service_id,
      specialist_id,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "new",
      shop_id: Number(shopId),
      full_price: priced.full_price,
      discount_amount: priced.discount_amount,
      final_price: priced.final_price,
      price_snapshot: priced.final_price,
      promo_id: priced.promo_id,
      points_to_redeem: redeem,
      cert_to_redeem: cert,
      cert_id: certIdToStore,
    })
    .select("id, starts_at, ends_at")
    .single();

  if (bErr || !booking) {
    await admin.from("orders").delete().eq("id", order.id);
    const overlap = bErr?.code === "23P01" || /overlap|exclusion/i.test(bErr?.message ?? "");
    if (overlap) return json({ error: "slot_taken" }, 409);
    return json({ error: bErr?.message ?? "booking_failed" }, 500);
  }

  // ===== 🔥 ПОЛУЧАЕМ ДАННЫЕ ДЛЯ УВЕДОМЛЕНИЙ =====
  const [{ data: s2 }, { data: sp2 }, { data: client }] = await Promise.all([
    admin.from("services").select("name").eq("id", service_id).maybeSingle(),
    admin.from("specialists").select("full_name").eq("id", specialist_id).maybeSingle(),
    admin.from("users").select("first_name, last_name, username").eq("telegram_id", user.id).maybeSingle(),
  ]);

  const clientName = client 
    ? [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || client.username || "Клиент"
    : "Клиент";

  // ===== 🔥 УВЕДОМЛЕНИЕ КЛИЕНТУ =====
  const when = new Date(booking.starts_at).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC"
  });

  try {
    await tgSend(
      user.id,
      `✅ <b>Вы записаны!</b>\n\n` +
        `${s2?.name ?? "Услуга"} · ${sp2?.full_name ?? ""}\n` +
        `🗓 ${when}\n` +
        (redeem > 0 ? `⭐ Списываем баллов: ${redeem}\n` : "") +
        (cert > 0 ? `🎟 Сертификат: −${cert} ${currencySymbol}\n` : "") +
        `💰 К оплате: ${moneyDue} ${currencySymbol}`,
      shop.bot_token
    );
  } catch { /* noop */ }

  // ===== 🔥 УВЕДОМЛЕНИЕ АДМИНАМ О НОВОЙ ЗАПИСИ =====
  try {
    await notifyNewBooking(Number(shopId), {
      service_name: s2?.name ?? "Услуга",
      specialist_name: sp2?.full_name ?? "Мастер",
      starts_at: booking.starts_at,
      client_name: clientName,
      price: moneyDue,
      currency_symbol: currencySymbol,
    });
  } catch (error) {
    console.error('❌ Ошибка отправки уведомления админам:', error);
  }

  return json({
    ok: true,
    order_id: order.id,
    booking_id: booking.id,
    starts_at: booking.starts_at,
    ends_at: booking.ends_at,
    full_price: priced.full_price,
    discount_amount: priced.discount_amount,
    final_price: priced.final_price,
    points_redeemed: redeem,
    cert_redeemed: cert,
    money_due: moneyDue,
    promo_title: priced.promo_title,
  });
}