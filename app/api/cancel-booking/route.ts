import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

const CANCEL_THRESHOLD_MS = 3 * 3600_000;
const ACTIVE = ["new", "confirmed", "paid"];

export async function POST(req: Request) {
  let body: { initData?: string; booking_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!body.booking_id) return json({ error: "bad_request" }, 400);

  const admin = createAdmin();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, client_id, status, starts_at")
    .eq("id", body.booking_id)
    .maybeSingle();

  if (!booking) return json({ error: "not_found" }, 404);
  if (booking.client_id !== user.id) return json({ error: "forbidden" }, 403);
  if (!ACTIVE.includes(booking.status)) return json({ error: "not_cancelable" }, 400);
  if (new Date(booking.starts_at).getTime() - Date.now() < CANCEL_THRESHOLD_MS) {
    return json({ error: "too_late" }, 400);
  }

  const { error } = await admin
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("id", booking.id);
  if (error) return json({ error: error.message }, 500);

  // слот освободился — сразу предлагаем его тем, кто ждёт в очереди,
  // не дожидаясь планового сканирования (раз в 5 минут)
  notifyWaitlist();

  return json({ ok: true });
}

/** Дёргаем сканер очереди в фоне: ответ клиенту не ждёт рассылки */
function notifyWaitlist() {
  const url = process.env.NEXT_PUBLIC_CRM_URL ?? process.env.CRM_URL;
  const secret = process.env.CRON_SECRET;
  if (!url || !secret) return;

  void fetch(`${url}/api/cron/waitlist`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${secret}`,
    },
    body: "{}",
  }).catch(() => {
    /* плановый cron всё равно подхватит */
  });
}
