import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: { initData?: string; broadcast_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();

  // ставим флаг отписки
  const { error: uErr } = await admin
    .from("users")
    .update({ promo_opt_out: true })
    .eq("telegram_id", user.id);
  if (uErr) return json({ ok: false, error: uErr.message }, 500);

  // помечаем все pending-получения этого клиента как opted_out
  await admin
    .from("broadcast_recipients")
    .update({ status: "opted_out" })
    .eq("client_id", user.id)
    .eq("status", "pending");

  // если пришёл broadcast_id — пересчитаем метрики этой кампании
  if (body.broadcast_id) {
    await admin.rpc("broadcast_recalc", { p_broadcast: body.broadcast_id });
  }

  return json({ ok: true });
}
