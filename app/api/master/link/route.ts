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
  let body: { initData?: string; contact?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const token = process.env.TELEGRAM_BOT_TOKEN!;
  const user = validateInitData(body.initData ?? "", token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();

  // способ 1 — подписанный контакт
  if (body.contact) {
    const contact = validateContact(body.contact, token);
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
