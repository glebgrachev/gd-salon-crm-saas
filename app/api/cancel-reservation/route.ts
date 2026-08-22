import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";
import { tgSend } from "@/lib/notify"; // 👈 ДОБАВЛЯЕМ
import { notifyReservationCancelled } from "@/lib/notify-admins"; // 👈 ДОБАВЛЯЕМ

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/**
 * Клиент сам отменяет резерв товара — тот возвращается в продажу.
 * Отменить можно только СВОЙ резерв и только пока он не оплачен.
 */
export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    sale_id?: string;
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

  if (!body.sale_id) return json({ error: "bad_request" }, 400);

  // ===== ПОЛУЧАЕМ ДАННЫЕ РЕЗЕРВА =====
  const { data: sale } = await admin
    .from("product_sales")
    .select(`
      id, 
      client_id, 
      status,
      qty,
      product:products (name),
      client:users (first_name, last_name, username, telegram_id)
    `)
    .eq("id", body.sale_id)
    .maybeSingle();

  if (!sale) return json({ ok: false, error: "not_found" }, 404);
  if (Number(sale.client_id) !== Number(user.id)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  if (sale.status !== "reserved") {
    return json({ ok: false, error: "not_reserved" }, 409);
  }

  const clientName = sale.client 
    ? [sale.client.first_name, sale.client.last_name].filter(Boolean).join(" ").trim() || sale.client.username || "Клиент"
    : "Клиент";

  const productName = sale.product?.name ?? "Товар";
  const quantity = sale.qty ?? 0;

  // ===== ОТМЕНЯЕМ РЕЗЕРВ =====
  const { data, error } = await admin.rpc("cancel_product_sale", { p_sale: body.sale_id });
  if (error) return json({ ok: false, error: error.message }, 500);

  const res = data as { ok?: boolean };

  // ===== 🔥 УВЕДОМЛЕНИЕ КЛИЕНТУ =====
  try {
    await tgSend(
      user.id,
      `❌ <b>Резерв товара отменён</b>\n\n` +
        `📦 ${productName} × ${quantity} шт\n\n` +
        `Товар возвращён на склад.`,
      shop.bot_token
    );
  } catch { /* noop */ }

  // ===== 🔥 УВЕДОМЛЕНИЕ АДМИНАМ ОБ ОТМЕНЕ РЕЗЕРВА =====
  try {
    await notifyReservationCancelled(Number(shopId), {
      product_name: productName,
      quantity: quantity,
      client_name: clientName,
    });
  } catch (error) {
    console.error('❌ Ошибка отправки уведомления админам:', error);
  }

  return json({ ok: res?.ok === true });
}