import { createAdmin } from "@/lib/supabase/admin";
import { sendBatch, WORKER_BATCH } from "@/lib/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Pending = {
  broadcast_id: string;
  client_id: number;
};

type Broadcast = { id: string; text: string; cta_url: string | null };

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createAdmin();

  // забираем пачку pending (до WORKER_BATCH за один тик)
  const { data: pending } = await admin
    .from("broadcast_recipients")
    .select("broadcast_id, client_id")
    .eq("status", "pending")
    .order("broadcast_id")
    .limit(WORKER_BATCH);

  const rows = (pending as Pending[]) ?? [];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });
  }

  // группируем по кампаниям
  const byBroadcast = new Map<string, number[]>();
  for (const r of rows) {
    const arr = byBroadcast.get(r.broadcast_id) ?? [];
    arr.push(r.client_id);
    byBroadcast.set(r.broadcast_id, arr);
  }

  const ids = [...byBroadcast.keys()];
  const { data: bcData } = await admin
    .from("broadcasts")
    .select("id, text, cta_url")
    .in("id", ids);
  const bcMap = new Map<string, Broadcast>();
  for (const b of (bcData as Broadcast[]) ?? []) bcMap.set(b.id, b);

  let processed = 0;
  for (const [broadcastId, clientIds] of byBroadcast) {
    const bc = bcMap.get(broadcastId);
    if (!bc) continue;
    await sendBatch(admin, broadcastId, clientIds, bc.text, bc.cta_url);
    await admin.rpc("broadcast_recalc", { p_broadcast: broadcastId });
    processed += clientIds.length;
  }

  return new Response(JSON.stringify({ ok: true, processed }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}