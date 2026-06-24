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
    })
    .select("id, starts_at, ends_at")
    .single();

  if (bErr || !booking) {
    await admin.from("orders").delete().eq("id", order.id); // откат
    const overlap = bErr?.code === "23P01" || /overlap|exclusion/i.test(bErr?.message ?? "");
    if (overlap) return json({ error: "slot_taken" }, 409);
    return json({ error: bErr?.message ?? "booking_failed" }, 500);
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
      `✅ <b>Вы записаны!</b>\n\n` +
        `${s2?.name ?? "Услуга"} · ${sp2?.full_name ?? ""}\n` +
        `🗓 ${when}\n` +
        `💰 К оплате: ${priced.final_price} ₽`,
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
    promo_title: priced.promo_title,
  });
}
