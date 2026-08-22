import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { priceService, priceCart, type CartItemIn } from "@/lib/pricing";
import { tgSend } from "@/lib/notify";
import { json, options } from "@/lib/cors";
import { notifyNewOrder } from "@/lib/notify-admins";

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
  let body: {
    initData?: string;
    shop_id?: string;
    items?: InItem[];
    points?: number;
    cert?: number;
    cert_id?: string;
    products?: { product_id: string; qty: number }[];
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

  // ===== 2. ПОЛУЧАЕМ ТОКЕН БОТА И ВАЛЮТУ ИЗ shops_details =====
  const { data: shop, error: shopError } = await admin
    .from("shops_details")
    .select("bot_token, currency_symbol")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  const currencySymbol = shop.currency_symbol || '₽';

  // ===== 3. ПРОВЕРЯЕМ initData =====
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  // ===== 🔥 ПРОВЕРКА НА ЗАМОРОЗКУ =====
  const { data: userData, error: userError } = await admin
    .from("users")
    .select("frozen")
    .eq("telegram_id", user.id)
    .maybeSingle();

  if (!userError && userData?.frozen === true) {
    console.warn('⚠️ Попытка оформления заказа замороженным пользователем:', user.id);
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

  const items = body.items ?? [];
  if (items.length === 0) return json({ error: "empty" }, 400);

  // ===== ПОЛУЧАЕМ ИМЯ КЛИЕНТА =====
  const { data: client } = await admin
    .from("users")
    .select("first_name, last_name, username")
    .eq("telegram_id", user.id)
    .maybeSingle();

  const clientName = client 
    ? [client.first_name, client.last_name].filter(Boolean).join(" ").trim() || client.username || "Клиент"
    : "Клиент";

  // длительности услуг (для ends_at)
  const serviceIds = [...new Set(items.map((i) => i.service_id))];
  const { data: svcRows } = await admin
    .from("services")
    .select("id, duration_min")
    .in("id", serviceIds)
    .eq("shop_id", Number(shopId));
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

  // ===== 5. СОЗДАЁМ/ОБНОВЛЯЕМ ПОЛЬЗОВАТЕЛЯ С shop_id =====
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

  // ---- товары из той же корзины: откладываем в салоне ----
  const wanted = (body.products ?? []).filter((p) => p.product_id && p.qty > 0);
  const reservedIds: string[] = [];
  const soldOut: string[] = [];
  let productsTotal = 0;

  for (const it of wanted) {
    const { data: sale, error: saleErr } = await admin.rpc("sell_product", {
      p_product: it.product_id,
      p_qty: it.qty,
      p_client: user.id,
      p_specialist: null,
      p_booking: null,
      p_status: "reserved",
    });

    if (saleErr) {
      soldOut.push(it.product_id);
      continue;
    }
    const r = sale as { ok?: boolean; sale_id?: string };
    if (r?.ok && r.sale_id) reservedIds.push(r.sale_id);
    else soldOut.push(it.product_id);
  }

  // ===== ПОЛУЧАЕМ ДАННЫЕ ДЛЯ УВЕДОМЛЕНИЙ =====
  const [{ data: svcNames }, { data: spNames }] = await Promise.all([
    admin.from("services").select("id, name").in("id", serviceIds).eq("shop_id", Number(shopId)),
    admin.from("specialists").select("id, full_name").in("id", [...new Set(items.map((i) => i.specialist_id))]).eq("shop_id", Number(shopId)),
  ]);
  const svcName = new Map(((svcNames as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name]));
  const spName = new Map(((spNames as { id: string; full_name: string }[]) ?? []).map((s) => [s.id, s.full_name]));

  const total = rpcItems.reduce((s, r) => s + Number(r.final_price), 0);
  const moneyDue = Math.max(0, total - redeemTotal * pointValue - certTotal);

  // ===== 🔥 УВЕДОМЛЕНИЕ КЛИЕНТУ =====
  const lines = items
    .map((it, idx) => {
      const gift = rpcItems[idx].is_gift ? " 🎁" : "";
      const time = new Date(it.starts_at).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC"
      });
      return `• ${svcName.get(it.service_id) ?? "Услуга"}${gift} — ${spName.get(it.specialist_id) ?? ""}\n   ${time}`;
    })
    .join("\n");

  let productBlock = "";
  if (reservedIds.length > 0) {
    const { data: sales } = await admin
      .from("product_sales")
      .select("qty, total, product:products ( name )")
      .in("id", reservedIds);

    type SaleRow = { qty: number; total: number; product: { name: string } | null };
    const rows = (sales as unknown as SaleRow[]) ?? [];
    productsTotal = rows.reduce((sum, r) => sum + Number(r.total), 0);

    const pLines = rows
      .map((r) => `• ${r.product?.name ?? "Товар"} × ${r.qty} — ${Math.round(Number(r.total))} ${currencySymbol}`)
      .join("\n");

    productBlock = `\n\n🛍 <b>Товары к выдаче</b>\n${pLines}`;
  }

  const soldOutBlock =
    soldOut.length > 0
      ? `\n\n⚠️ Часть товаров закончилась — их отложить не удалось.`
      : "";

  try {
    await tgSend(
      user.id,
      `✅ <b>Заказ оформлен!</b>\n\n${lines}` +
        productBlock +
        `\n\n` +
        (redeemTotal > 0 ? `⭐ Списываем баллов: ${redeemTotal}\n` : "") +
        (certTotal > 0 ? `🎟 Сертификат: −${certTotal} ${currencySymbol}\n` : "") +
        `💰 К оплате: ${moneyDue + Math.round(productsTotal)} ${currencySymbol}` +
        (productsTotal > 0 ? `\n   (услуги ${moneyDue} ${currencySymbol} + товары ${Math.round(productsTotal)} ${currencySymbol})` : "") +
        soldOutBlock,
      shop.bot_token
    );
  } catch { /* noop */ }

  // ===== 🔥 УВЕДОМЛЕНИЕ АДМИНАМ О НОВОМ ЗАКАЗЕ =====
  try {
    const serviceLines = items.map((it, idx) => {
      const gift = rpcItems[idx].is_gift ? " 🎁" : "";
      return `${svcName.get(it.service_id) ?? "Услуга"}${gift} (${spName.get(it.specialist_id) ?? ""})`;
    });

    const productLines = reservedIds.length > 0
      ? await (async () => {
          const { data: sales } = await admin
            .from("product_sales")
            .select("qty, product:products ( name )")
            .in("id", reservedIds);
          type SaleRow2 = { qty: number; product: { name: string } | null };
          return ((sales as unknown as SaleRow2[]) ?? []).map(
            (r) => `${r.product?.name ?? "Товар"} × ${r.qty}`
          );
        })()
      : [];

    await notifyNewOrder(
      Number(shopId),
      {
        items: serviceLines,
        products: productLines.length > 0 ? productLines : undefined,
        client_name: clientName,
        total: moneyDue + Math.round(productsTotal),
        currency_symbol: currencySymbol,
      },
      shop.bot_token
    );
  } catch (error) {
    console.error('❌ Ошибка отправки уведомления админам о новом заказе:', error);
  }

  return json({
    ok: true,
    order_id: result.order_id,
    points_redeemed: redeemTotal,
    cert_redeemed: certTotal,
    products_reserved: reservedIds.length,
    products_sold_out: soldOut.length,
  });
}