import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";
import { tgSend, fmtMsk } from "@/lib/notify";
import { priceService } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    booking_id?: string;
    specialist_id?: string;
    starts_at?: string;
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

  // ===== 2. ПОЛУЧАЕМ ТОКЕН БОТА ИЗ ТАБЛИЦЫ shops =====
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  // ===== 3. ПРОВЕРЯЕМ initData С ТОКЕНОМ САЛОНА =====
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  // ===== 🔥 ПРОВЕРКА НА ЗАМОРОЗКУ =====
  const { data: userData, error: userError } = await admin
    .from("users")
    .select("frozen")
    .eq("telegram_id", user.id)
    .maybeSingle();

  if (!userError && userData?.frozen === true) {
    console.warn('⚠️ Попытка переноса записи замороженным пользователем:', user.id);
    // Отправляем сообщение в Telegram
    try {
      await tgSend(
        user.id,
        '🔒 Функционал приложения временно ограничен.\n\nПожалуйста, обратитесь к администратору салона.',
        shop.bot_token // 👈 ПЕРЕДАЁМ ТОКЕН
      );
    } catch {}
    return json({ 
      ok: false, 
      error: 'User is frozen',
      message: 'Функционал приложения временно ограничен. Пожалуйста, обратитесь к администратору салона.'
    }, 403);
  }

  const { booking_id, specialist_id, starts_at } = body;
  if (!booking_id || !specialist_id || !starts_at) return json({ error: "bad_request" }, 400);

  // старая бронь: должна быть клиента, 'new', в процессе переноса
  const { data: oldB } = await admin
    .from("bookings")
    .select("id, client_id, service_id, status, starts_at, orig_starts_at, rescheduling_started_at, order_id, points_to_redeem, cert_to_redeem, cert_id")
    .eq("id", booking_id)
    .maybeSingle();

  if (!oldB || oldB.client_id !== user.id) return json({ error: "forbidden" }, 403);
  if (oldB.status !== "new" || oldB.rescheduling_started_at == null) {
    return json({ error: "reschedule_expired" }, 400);
  }

  // услуга не меняется
  const service_id = oldB.service_id as string;

  const { data: svc } = await admin
    .from("services")
    .select("duration_min")
    .eq("id", service_id)
    .eq("shop_id", Number(shopId))
    .maybeSingle();
  if (!svc) return json({ error: "service_not_found" }, 400);

  const start = new Date(starts_at);
  if (isNaN(start.getTime())) return json({ error: "bad_time" }, 400);
  const end = new Date(start.getTime() + svc.duration_min * 60000);

  // правило: не дальше max_forward_days от исходного времени
  const { data: cfg } = await admin
    .from("reschedule_settings")
    .select("max_forward_days")
    .eq("id", 1)
    .maybeSingle();
  const orig = new Date(oldB.orig_starts_at ?? oldB.starts_at);
  const maxDays = Number(cfg?.max_forward_days ?? 30);
  if (start > new Date(orig.getTime() + maxDays * 86400000)) {
    return json({ error: "reschedule_too_far" }, 400);
  }

  // мастер должен оказывать эту услугу
  const { data: ss } = await admin
    .from("specialist_services")
    .select("price")
    .eq("specialist_id", specialist_id)
    .eq("service_id", service_id)
    .maybeSingle();
  if (!ss) return json({ error: "specialist_invalid" }, 400);

  // цена пересчитывается по актуальным правилам (мастер мог смениться)
  const priced = await priceService(admin, service_id, specialist_id);
  if ("error" in priced) return json(priced, 400);

  // новый заказ + бронь
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
      full_price: priced.full_price,
      discount_amount: priced.discount_amount,
      final_price: priced.final_price,
      price_snapshot: priced.final_price,
      promo_id: priced.promo_id,
      // намерения по баллам/сертификату переносим как есть (реального списания ещё не было)
      points_to_redeem: oldB.points_to_redeem ?? 0,
      cert_to_redeem: oldB.cert_to_redeem ?? 0,
      cert_id: oldB.cert_id ?? null,
    })
    .select("id, starts_at")
    .single();

  if (bErr || !booking) {
    await admin.from("orders").delete().eq("id", order.id);
    const overlap = bErr?.code === "23P01" || /overlap|exclusion/i.test(bErr?.message ?? "");
    if (overlap) return json({ error: "slot_taken" }, 409);
    return json({ error: bErr?.message ?? "booking_failed" }, 500);
  }

  // связываем: старая → cancelled, новая получает счётчик и историю
  const { data: fin } = await admin.rpc("finalize_reschedule", {
    p_old_booking: oldB.id,
    p_new_booking: booking.id,
    p_client: user.id,
  });
  const ok = (fin as { ok?: boolean } | null)?.ok === true;
  if (!ok) {
    // откат: удаляем созданную бронь и заказ
    await admin.from("bookings").delete().eq("id", booking.id);
    await admin.from("orders").delete().eq("id", order.id);
    return json({ error: "reschedule_failed" }, 409);
  }

  // ===== 🔥 УВЕДОМЛЕНИЕ — ПЕРЕДАЁМ ТОКЕН =====
  try {
    const [{ data: s2 }, { data: sp2 }] = await Promise.all([
      admin.from("services").select("name").eq("id", service_id).maybeSingle(),
      admin.from("specialists").select("full_name").eq("id", specialist_id).maybeSingle(),
    ]);
    await tgSend(
      user.id,
      `🔄 <b>Запись перенесена!</b>\n\n` +
        `${s2?.name ?? "Услуга"} · ${sp2?.full_name ?? ""}\n` +
        `🗓 ${fmtMsk(booking.starts_at)}\n` +
        `💰 ${priced.final_price} ₽`,
      shop.bot_token // 👈 ПЕРЕДАЁМ ТОКЕН
    );
  } catch {
    /* noop */
  }

  return json({
    ok: true,
    booking_id: booking.id,
    starts_at: booking.starts_at,
    final_price: priced.final_price,
  });
}