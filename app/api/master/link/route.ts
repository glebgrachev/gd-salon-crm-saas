import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

// { initData, phone } или { initData, code }
export async function POST(req: Request) {
  let body: { initData?: string; phone?: string; code?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();

  if (body.phone) {
    const { data, error } = await admin.rpc("link_specialist_by_phone", {
      p_telegram: user.id,
      p_phone: body.phone,
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json(data);
  }

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
