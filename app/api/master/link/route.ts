import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData, validateContact } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/**
 * Привязка мастера к Telegram.
 *  { initData, contact }  — подписанный ответ Telegram.requestContact()
 *  { initData, code }     — код привязки из CRM
 *
 * Сырой телефон строкой НЕ принимаем: иначе любой, зная номер мастера,
 * привязал бы свой Telegram к чужому кабинету.
 */
export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    contact?: string;
    code?: string;
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

  // способ 1 — подписанный контакт
  if (body.contact) {
    const contact = validateContact(body.contact, shop.bot_token);
    if (!contact) return json({ ok: false, error: "bad_signature" }, 400);

    // контакт должен принадлежать тому же пользователю, что открыл приложение
    if (Number(contact.user_id) !== Number(user.id)) {
      return json({ ok: false, error: "contact_mismatch" }, 403);
    }

    const { data, error } = await admin.rpc("link_specialist_by_phone", {
      p_telegram: user.id,
      p_phone: contact.phone_number,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json(data);
  }

  // способ 2 — код
  if (body.code) {
    const { data, error } = await admin.rpc("link_specialist_by_code", {
      p_telegram: user.id,
      p_code: body.code,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json(data);
  }

  return json({ ok: false, error: "bad_request" }, 400);
}