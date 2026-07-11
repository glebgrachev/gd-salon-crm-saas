import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { json, options } from "@/lib/cors";
import { sendBatch, SYNC_LIMIT } from "@/lib/broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

type Recipient = { client_id: number };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return json({ error: "forbidden" }, 403);

  let body: { segments?: string[]; text?: string; cta_url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const segments = Array.isArray(body.segments) ? body.segments.filter((s) => typeof s === "string") : [];
  const text = (body.text ?? "").trim();
  const cta_url = (body.cta_url ?? "").trim() || null;

  const validSegs = new Set(["new", "regular", "sleeping", "lost", "no_visits", "all"]);
  const segs = segments.filter((s) => validSegs.has(s));
  if (segs.length === 0) return json({ error: "no_segments" }, 400);
  if (!text) return json({ error: "empty_text" }, 400);
  if (text.length > 3500) return json({ error: "text_too_long" }, 400);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdmin();

  const { data: recData, error: recErr } = await admin.rpc("broadcast_recipients_for_segments", { p_segments: segs });
  if (recErr) return json({ error: recErr.message }, 500);

  const recipients = ((recData as Recipient[]) ?? []).map((r) => r.client_id);
  if (recipients.length === 0) {
    return json({ ok: false, error: "no_recipients", total: 0 }, 200);
  }

  const { data: bc, error: bcErr } = await admin
    .from("broadcasts")
    .insert({
      author_id: user?.id ?? null,
      segments: segs,
      text,
      cta_url,
      total: recipients.length,
      status: "sending",
    })
    .select("id")
    .single();
  if (bcErr || !bc) return json({ error: bcErr?.message ?? "insert_failed" }, 500);

  const rows = recipients.map((cid) => ({ broadcast_id: bc.id, client_id: cid, status: "pending" as const }));
  const { error: rowsErr } = await admin.from("broadcast_recipients").insert(rows);
  if (rowsErr) return json({ error: rowsErr.message }, 500);

  if (recipients.length <= SYNC_LIMIT) {
    await sendBatch(admin, bc.id, recipients, text, cta_url);
    await admin.rpc("broadcast_recalc", { p_broadcast: bc.id });
    return json({ ok: true, broadcast_id: bc.id, total: recipients.length, mode: "sync" });
  }

  return json({ ok: true, broadcast_id: bc.id, total: recipients.length, mode: "background" });
}
