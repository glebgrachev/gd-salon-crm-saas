import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { priceService } from "@/lib/pricing";
import { json, options } from "@/lib/cors";
import { tgSend, fmtMsk } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: {
    initData?: string;
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

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { service_id, specialist_id, starts_at } = body;
  if (!service_id || !specialist_id || !starts_at) return json({ error: "bad_request" }, 400);

  const admin = createAdmin();

  // длительность услуги
  const { data: svc } = await admin
    .from("services")
    .select("duration_min")
    .eq("id", service_id)
    .maybeSingle();
  if (!svc) return json({ error: "service_not_found" }, 400);

  // цена (авторитетно на сервере)
  const priced = await priceService(admin, service_id, specialist_id);
  if ("error" in priced) return json(priced, 400);

  // клиент (создаём/обновляем, телефон не трогаем)
  await admin.from("users").upsert(
    {
      telegram_id: user.id,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      username: user.username ?? null,
    },
    { onConflict: "telegram_id" },
  );

  const start = new Date(starts_at);
  if (isNaN(start.getTime())) return json({ error: "bad_time" }, 400);
  const end = new Date(start.getTime() + svc.duration_min * 60000);

  // если у клиента есть активный перенос — учитываем срок и связываем позже
  const { data: oldB } = await admin
    .from("bookings")
    .select("id, orig_starts_at, starts_at")
    .eq("client_id", user.id)
    .eq("status", "new")
    .not("rescheduling_started_at", "is", null)
    .order("rescheduling_started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (oldB) {
    const { data: cfg } = await admin
      .from("reschedule_settings")
      .select("max_forward_days")
      .eq("id", 1)
      .maybeSingle();
    const orig = new Date(oldB.orig_starts_at ?? oldB.starts_at);
    const maxDays = Number(cfg?.max_forward_days ?? 30);
    const limit = new Date(orig.getTime() + maxDays * 86400000);
    if (start > limit) return json({ error: "reschedule_too_far" }, 400);
  }

  // применение баллов: не больше запрошенного, лимита redeem_max_percent и баланса
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

  // применение сертификата: конкретный сертификат (cert_id), в пределах его остатка/срока
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
      subtotal: priced.full_price,
      discount_total: priced.discount_amount,
      total: priced.final_price,
    })
    .select("id")
    .single();
  if (oErr || !order) return json({ error: oErr?.message ?? "order_failed" }, 500);

  // запись (бронь). Эксклюзивный constraint не даст пересечься по времени у мастера.
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
      points_to_redeem: redeem,
      cert_to_redeem: cert,
      cert_id: certIdToStore,
    })
    .select("id, starts_at, ends_at")
    .single();

  if (bErr || !booking) {
    await admin.from("orders").delete().eq("id", order.id); // откат
    const overlap = bErr?.code === "23P01" || /overlap|exclusion/i.test(bErr?.message ?? "");
    if (overlap) return json({ error: "slot_taken" }, 409);
    return json({ error: bErr?.message ?? "booking_failed" }, 500);
  }

  // финализация переноса (если был активный)
  let wasReschedule = false;
  if (oldB) {
    const { data: fin } = await admin.rpc("finalize_reschedule", {
      p_old_booking: oldB.id,
      p_new_booking: booking.id,
      p_client: user.id,
    });
    wasReschedule = (fin as { ok?: boolean } | null)?.ok === true;
  }

  // мгновенное подтверждение в Telegram (не валит запись при сбое)
  try {
    const [{ data: s2 }, { data: sp2 }] = await Promise.all([
      admin.from("services").select("name").eq("id", service_id).maybeSingle(),
      admin.from("specialists").select("full_name").eq("id", specialist_id).maybeSingle(),
    ]);
    const when = fmtMsk(booking.starts_at);
    await tgSend(
      user.id,
      (wasReschedule ? `🔄 <b>Запись перенесена!</b>\n\n` : `✅ <b>Вы записаны!</b>\n\n`) +
        `${s2?.name ?? "Услуга"} · ${sp2?.full_name ?? ""}\n` +
        `🗓 ${when}\n` +
        (redeem > 0 ? `⭐ Списываем баллов: ${redeem}\n` : "") +
        (cert > 0 ? `🎟 Сертификат: −${cert} ₽\n` : "") +
        `💰 К оплате: ${moneyDue} ₽`,
    );
  } catch {
    /* noop */
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
