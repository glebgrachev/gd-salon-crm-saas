import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

export async function POST(req: Request) {
  let body: { initData?: string; from?: string; to?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();
  const { data: me } = await admin.rpc("whoami_specialist", { p_telegram: user.id });
  const spec = (me as { ok?: boolean; specialist_id?: string } | null);
  if (!spec?.ok || !spec.specialist_id) return json({ error: "not_linked" }, 403);

  const now = new Date();
  const defFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data, error } = await admin.rpc("specialist_earnings", {
    p_specialist: spec.specialist_id,
    p_from: body.from ?? defFrom,
    p_to: body.to ?? defTo,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, earnings: data });
}
