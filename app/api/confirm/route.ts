import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

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
    .select(
      "id, client_id, status, starts_at, client_confirmed_at, service:services ( name ), specialist:specialists ( full_name )",
    )
    .eq("id", body.booking_id)
    .maybeSingle();

  if (!booking) return json({ error: "not_found" }, 404);
  if (booking.client_id !== user.id) return json({ error: "forbidden" }, 403);

  const already = !!booking.client_confirmed_at;
  if (!already) {
    const patch: { client_confirmed_at: string; status?: string } = {
      client_confirmed_at: new Date().toISOString(),
    };
    if (booking.status === "new") patch.status = "confirmed";
    await admin.from("bookings").update(patch).eq("id", booking.id);
  }

  const svc = booking.service as { name: string } | null;
  const sp = booking.specialist as { full_name: string } | null;

  return json({
    ok: true,
    already,
    service: svc?.name ?? null,
    specialist: sp?.full_name ?? null,
    starts_at: booking.starts_at,
  });
}
