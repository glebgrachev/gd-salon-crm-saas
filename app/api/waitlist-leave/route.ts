import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

export async function POST(req: Request) {
  let body: { initData?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!body.id) return json({ error: "bad_request" }, 400);

  const admin = createAdmin();
  const { data, error } = await admin.rpc("leave_waitlist", {
    p_id: body.id,
    p_client: user.id,
  });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json(data);
}
