import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

export async function POST(req: Request) {
  let body: { initData?: string; booking_id?: string; status?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!body.booking_id || !body.status) return json({ error: "bad_request" }, 400);

  const admin = createAdmin();
  const { data, error } = await admin.rpc("specialist_mark_booking", {
    p_telegram: user.id,
    p_booking: body.booking_id,
    p_status: body.status,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json(data);
}
