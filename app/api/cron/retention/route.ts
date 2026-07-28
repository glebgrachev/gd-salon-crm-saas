import { createAdmin } from "@/lib/supabase/admin";
import { sendReactivation } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  client_id: number;
  first_name: string | null;
  segment: string;
  days_since_last: number | null;
};

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createAdmin();

  // берём тех, кто уже в «Спящем» и кому мы ещё ни разу не отправляли напоминание
  const { data } = await admin
    .from("v_client_segments")
    .select("client_id, first_name, segment, days_since_last, retention_notified_at")
    .eq("segment", "sleeping")
    .is("retention_notified_at", null)
    .limit(200);

  const rows = (data as (Row & { retention_notified_at: string | null })[]) ?? [];
  let sent = 0;

  for (const r of rows) {
    const ok = await sendReactivation(r.client_id, r.first_name, r.days_since_last);
    if (ok) {
      await admin
        .from("users")
        .update({ retention_notified_at: new Date().toISOString() })
        .eq("telegram_id", r.client_id);
      sent++;
    }
  }

  return new Response(JSON.stringify({ ok: true, candidates: rows.length, sent }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
