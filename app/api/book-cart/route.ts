import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { priceService, priceCart, type CartItemIn } from "@/lib/pricing";
import { tgSend, fmtMsk } from "@/lib/notify";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

type InItem = {
  service_id: string;
  specialist_id: string;
  starts_at: string;
  is_gift?: boolean;
  gift_discount_percent?: number;
};

export async function POST(req: Request) {
  let body: { initData?: string; items?: InItem[]; points?: number; cert?: number; cert_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  const items = body.items ?? [];
  if (items.length === 0) return json({ error: "empty" }, 400);

  const admin = createAdmin();

  // активный перенос (если есть)
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
    const limitAt = new Date(orig.getTime() + maxDays * 86400000);
    const beyond = items.some((it) => new Date(it.starts_at) > limitAt);
    if (beyond) return json({ error: "reschedule_too_far" }, 400);
  }

  // длительности услуг (для ends_at)
  const serviceIds = [...new Set(items.map((i) => i.service_id))];
  const { data: svcRows } = await admin
    .from("services")
    .select("id, duration_min")
    .in("id", serviceIds);
  const durById = new Map(((svcRows as { id: string; duration_min: number }[]) ?? []).map((s) => [s.id, s.duration_min]));

  // легитимные подарки — пересчёт по обычным позициям
  const nonGift: CartItemIn[] = items
    .filter((i) => !i.is_gift)
    .map((i) => ({ service_id: i.service_id, specialist_id: i.specialist_id }));
  const cartPrice = nonGift.length ? await priceCart(admin, nonGift) : null;
  const allowedGifts = new Map(
    (cartPrice?.gifts ?? []).map((g) => [g.gift_service_id, { percent: g.gift_discount_percent, promo_id: g.promo_id }]),
  );

  // собираем позиции с серверными ценами в исходном порядке
  const rpcItems: Record<string, unknown>[] = [];
  for (const it of items) {
    const dur = durById.get(it.service_id);
    if (!dur) return json({ error: "service_not_found" }, 400);
    const start = new Date(it.starts_at);
    if (isNaN(start.getTime())) return json({ error: "bad_time" }, 400);
    const ends_at = new Date(start.getTime() + dur * 60000).toISOString();

    if (it.is_gift) {
      const allowed = allowedGifts.get(it.service_id);
      if (!allowed) return json({ error: "invalid_gift" }, 400);
      const { data: ss } = await admin
        .from("specialist_services")
        .select("price")
        .eq("service_id", it.service_id)
        .eq("specialist_id", it.specialist_id)
        .maybeSingle();
      if (!ss) return json({ error: "gift_master_invalid" }, 400);
      const full = Number(ss.price);
      const final = allowed.percent >= 100 ? 0 : Math.round((full * (100 - allowed.percent)) / 100);
      rpcItems.push({
        service_id: it.service_id,
        specialist_id: it.specialist_id,
        starts_at: start.toISOString(),
        ends_at,
        full_price: full,
        discount: full - final,
        final_price: final,
        promo_id: allowed.promo_id,
        is_gift: true,
      });
    } else {
      const priced = await priceService(admin, it.service_id, it.specialist_id);
      if ("error" in priced) return json(priced, 400);
      rpcItems.push({
        service_id: it.service_id,
        specialist_id: it.specialist_id,
        starts_at: start.toISOString(),
        ends_at,
        full_price: priced.full_price,
        discount: priced.discount_amount,
        final_price: priced.final_price,
        promo_id: priced.promo_id,
        is_gift: false,
      });
    }
  }

  // ---- распределение баллов по позициям (пропорционально цене) ----
  const reqPoints = Math.max(0, Math.floor(Number(body.points ?? 0)));
  let pointValue = 1;
  let redeemTotal = 0;
  const cartTotal = rpcItems.reduce((s, r) => s + Number(r.final_price), 0);
  if (reqPoints > 0 && cartTotal > 0) {
    const [{ data: cfg }, { data: acc }] = await Promise.all([
      admin.from("loyalty_settings").select("redeem_max_percent, point_value").eq("id", 1).maybeSingle(),
      admin.from("loyalty_accounts").select("balance").eq("client_id", user.id).maybeSingle(),
    ]);
    pointValue = Number(cfg?.point_value ?? 1) || 1;
    const maxPct = Number(cfg?.redeem_max_percent ?? 0);
    const maxByPct = Math.floor((cartTotal * maxPct) / 100 / pointValue);
    const balance = Number(acc?.balance ?? 0);
    redeemTotal = Math.max(0, Math.min(reqPoints, maxByPct, balance));

    if (redeemTotal > 0) {
      // метод наибольшего остатка: раздаём целые баллы пропорционально цене позиции
      const raw = rpcItems.map((r) => (redeemTotal * Number(r.final_price)) / cartTotal);
      const alloc = raw.map((x) => Math.floor(x));
      let left = redeemTotal - alloc.reduce((a, b) => a + b, 0);
      const byFrac = raw
        .map((x, i) => ({ i, frac: x - Math.floor(x) }))
        .sort((a, b) => b.frac - a.frac);
      for (let k = 0; k < byFrac.length && left > 0; k++) {
        alloc[byFrac[k].i]++;
        left--;
      }
      rpcItems.forEach((r, i) => {
        r.points_to_redeem = alloc[i];
      });
    }
  }
  if (redeemTotal === 0) rpcItems.forEach((r) => (r.points_to_redeem = 0));

  // ---- распределение сертификата (конкретного, по cert_id), после баллов ----
  const reqCert = Math.max(0, Math.floor(Number(body.cert ?? 0)));
  const certId = body.cert_id ?? null;
  let certTotal = 0;
  const moneyAfterPoints = Math.max(0, cartTotal - redeemTotal * pointValue);
  if (reqCert > 0 && certId && moneyAfterPoints > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: crow } = await admin
      .from("certificates")
      .select("id, balance, status, expires_at")
      .eq("id", certId)
      .eq("activated_by", user.id)
      .maybeSingle();
    const notExpired = !crow?.expires_at || crow.expires_at >= today;
    if (crow && crow.status === "active" && notExpired && Number(crow.balance) > 0) {
      certTotal = Math.max(0, Math.min(reqCert, Number(crow.balance), moneyAfterPoints));

      if (certTotal > 0) {
        // распределяем рубли сертификата пропорционально цене позиции (наиб. остаток)
        const raw = rpcItems.map((r) => (certTotal * Number(r.final_price)) / cartTotal);
        const alloc = raw.map((x) => Math.floor(x));
        let left = certTotal - alloc.reduce((a, b) => a + b, 0);
        const byFrac = raw
          .map((x, i) => ({ i, frac: x - Math.floor(x) }))
          .sort((a, b) => b.frac - a.frac);
        for (let k = 0; k < byFrac.length && left > 0; k++) {
          alloc[byFrac[k].i]++;
          left--;
        }
        rpcItems.forEach((r, i) => {
          r.cert_to_redeem = alloc[i];
          r.cert_id = alloc[i] > 0 ? crow.id : null;
        });
      }
    }
  }
  if (certTotal === 0) rpcItems.forEach((r) => { r.cert_to_redeem = 0; r.cert_id = null; });

  // пользователь
  await admin.from("users").upsert(
    {
      telegram_id: user.id,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      username: user.username ?? null,
    },
    { onConflict: "telegram_id" },
  );

  // атомарное создание
  const { data: res, error } = await admin.rpc("create_order_with_bookings", {
    p_client_id: user.id,
    p_items: rpcItems,
  });
  if (error) return json({ error: error.message }, 500);

  const result = res as { ok: boolean; order_id?: string; busy?: number[] };
  if (!result.ok) {
    return json({ ok: false, busy: result.busy ?? [] }, 409);
  }

  // финализация переноса (если был активный) — привязываем к самой ранней брони заказа
  let wasReschedule = false;
  if (oldB && result.order_id) {
    const { data: firstB } = await admin
      .from("bookings")
      .select("id")
      .eq("order_id", result.order_id)
      .order("starts_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (firstB) {
      const { data: fin } = await admin.rpc("finalize_reschedule", {
        p_old_booking: oldB.id,
        p_new_booking: firstB.id,
        p_client: user.id,
      });
      wasReschedule = (fin as { ok?: boolean } | null)?.ok === true;
    }
  }

  // сводное уведомление
  try {
    const [{ data: svcNames }, { data: spNames }] = await Promise.all([
      admin.from("services").select("id, name").in("id", serviceIds),
      admin.from("specialists").select("id, full_name").in("id", [...new Set(items.map((i) => i.specialist_id))]),
    ]);
    const svcName = new Map(((svcNames as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name]));
    const spName = new Map(((spNames as { id: string; full_name: string }[]) ?? []).map((s) => [s.id, s.full_name]));
    const total = rpcItems.reduce((s, r) => s + Number(r.final_price), 0);
    const moneyDue = Math.max(0, total - redeemTotal * pointValue - certTotal);
    const lines = items
      .map((it, idx) => {
        const gift = rpcItems[idx].is_gift ? " 🎁" : "";
        return `• ${svcName.get(it.service_id) ?? "Услуга"}${gift} — ${spName.get(it.specialist_id) ?? ""}\n   ${fmtMsk(it.starts_at)}`;
      })
      .join("\n");
    await tgSend(
      user.id,
      (wasReschedule ? `🔄 <b>Запись перенесена!</b>\n\n${lines}\n\n` : `✅ <b>Заказ оформлен!</b>\n\n${lines}\n\n`) +
        (redeemTotal > 0 ? `⭐ Списываем баллов: ${redeemTotal}\n` : "") +
        (certTotal > 0 ? `🎟 Сертификат: −${certTotal} ₽\n` : "") +
        `💰 К оплате: ${moneyDue} ₽`,
    );
  } catch {
    /* noop */
  }

  return json({ ok: true, order_id: result.order_id, points_redeemed: redeemTotal, cert_redeemed: certTotal });
}
