import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/** Встать в очередь на занятый слот или на день */
export async function POST(req: Request) {
  let body: {
    initData?: string;
    service_id?: string;
    specialist_id?: string;
    kind?: "slot" | "day";
    date?: string;
    slot?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  if (!body.service_id || !body.specialist_id || !body.kind || !body.date) {
    return json({ error: "bad_request" }, 400);
  }

  const admin = createAdmin();
  const { data, error } = await admin.rpc("join_waitlist", {
    p_client: user.id,
    p_service: body.service_id,
    p_specialist: body.specialist_id,
    p_kind: body.kind,
    p_date: body.date,
    p_slot: body.kind === "slot" ? body.slot : null,
  });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json(data);
}
