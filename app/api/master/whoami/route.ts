import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

export async function POST(req: Request) {
  let body: { initData?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();
  const { data } = await admin.rpc("whoami_specialist", { p_telegram: user.id });
  return json(data ?? { ok: false });
}
