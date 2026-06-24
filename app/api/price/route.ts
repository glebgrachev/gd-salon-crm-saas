import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { priceService } from "@/lib/pricing";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: { initData?: string; service_id?: string; specialist_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!body.service_id || !body.specialist_id) return json({ error: "bad_request" }, 400);

  const admin = createAdmin();
  const priced = await priceService(admin, body.service_id, body.specialist_id);
  if ("error" in priced) return json(priced, 400);
  return json(priced);
}
