import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";
import { tgSend } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

type Item = { product_id: string; qty: number };

/**
 * Клиент откладывает товары — заберёт и оплатит при визите.
 * Товар сразу снимается со склада (status = 'reserved').
 */
export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    items?: Item[];
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

  const items = (body.items ?? []).filter((i) => i.product_id && i.qty > 0);
  if (items.length === 0) return json({ error: "empty" }, 400);

  const created: string[] = [];
  const failed: { product_id: string; error: string; stock?: number }[] = [];

  for (const it of items) {
    const { data, error } = await admin.rpc("sell_product", {
      p_product: it.product_id,
      p_qty: it.qty,
      p_client: user.id,
      p_specialist: null,
      p_booking: null,
      p_status: "reserved",
    });

    if (error) {
      failed.push({ product_id: it.product_id, error: error.message });
      continue;
    }

    const res = data as { ok?: boolean; error?: string; sale_id?: string; stock?: number };
    if (res?.ok && res.sale_id) created.push(res.sale_id);
    else failed.push({ product_id: it.product_id, error: res?.error ?? "failed", stock: res?.stock });
  }

  // если ничего не прошло — откатывать нечего
  if (created.length === 0) {
    return json({ ok: false, failed }, 409);
  }

  // сводка клиенту
  try {
    const { data: sales } = await admin
      .from("product_sales")
      .select("qty, total, product:products ( name )")
      .in("id", created);

    type Row = { qty: number; total: number; product: { name: string } | null };
    const rows = (sales as unknown as Row[]) ?? [];
    const lines = rows
      .map((r) => `• ${r.product?.name ?? "Товар"} × ${r.qty} — ${Math.round(r.total)} ₽`)
      .join("\n");
    const total = rows.reduce((s, r) => s + Number(r.total), 0);

    await tgSend(
      user.id,
      `🛍 <b>Товары отложены!</b>\n\n${lines}\n\n` +
        `💰 К оплате при визите: ${Math.round(total)} ₽\n\n` +
        `Заберите их в салоне — мы придержим.`,
    );
  } catch {
    /* noop */
  }

  return json({ ok: true, reserved: created.length, failed });
}