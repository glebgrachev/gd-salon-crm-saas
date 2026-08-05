import { createAdmin } from "@/lib/supabase/admin";
import { tgSend } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocRow = {
  id: string;
  title: string;
  doc_type: string;
  specialist_name: string;
  expires_at: string;
  expiry_status: string;
  days_left: number | null;
};

const TYPE_LABEL: Record<string, string> = {
  diploma: "Диплом",
  certificate: "Сертификат",
  license: "Лицензия",
  medical: "Медкнижка",
  contract: "Договор",
  other: "Документ",
};

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createAdmin();

  // кому шлём: telegram_id из document_settings.notify_chat_id (задаётся в БД)
  const { data: cfg } = await admin
    .from("document_settings")
    .select("notify_chat_id")
    .eq("id", 1)
    .maybeSingle();

  const chatId = cfg?.notify_chat_id ? Number(cfg.notify_chat_id) : null;
  if (!chatId) {
    return new Response(JSON.stringify({ ok: true, skipped: "no_chat_id" }), { status: 200 });
  }

  const { data } = await admin
    .from("v_specialist_documents")
    .select("id, title, doc_type, specialist_name, expires_at, expiry_status, days_left")
    .in("expiry_status", ["expiring", "expired"])
    .order("expires_at", { ascending: true });

  const rows = (data as DocRow[]) ?? [];
  if (rows.length === 0) {
    return new Response(JSON.stringify({ ok: true, count: 0 }), { status: 200 });
  }

  const expired = rows.filter((r) => r.expiry_status === "expired");
  const expiring = rows.filter((r) => r.expiry_status === "expiring");

  const line = (r: DocRow) =>
    `• ${r.specialist_name} — ${TYPE_LABEL[r.doc_type] ?? "Документ"}: ${r.title}`;

  let text = `📄 <b>Документы мастеров</b>\n\n`;
  if (expired.length > 0) {
    text += `❌ <b>Истекли (${expired.length}):</b>\n` + expired.map(line).join("\n") + `\n\n`;
  }
  if (expiring.length > 0) {
    text +=
      `⚠️ <b>Скоро истекут (${expiring.length}):</b>\n` +
      expiring.map((r) => `${line(r)} — через ${r.days_left} дн.`).join("\n");
  }

  const ok = await tgSend(chatId, text.trim());

  return new Response(JSON.stringify({ ok: true, count: rows.length, sent: ok }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}