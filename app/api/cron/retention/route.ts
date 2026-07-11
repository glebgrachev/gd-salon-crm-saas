import { createAdmin } from "@/lib/supabase/admin";
import { tgSend } from "@/lib/notify";

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
  const miniApp = process.env.MINIAPP_URL ?? "https://beauty-miniapp-tawny.vercel.app";

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
    const hello = r.first_name ? `${r.first_name}, ` : "";
    const days = r.days_since_last ?? 0;
    const ok = await tgSend(
      r.client_id,
      `💜 <b>Мы соскучились!</b>\n\n` +
        `${hello}давно не виделись — прошло ${days} дн. с вашего последнего визита.\n` +
        `Возвращайтесь, будем рады!`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "Записаться", web_app: { url: miniApp } }]],
        },
      },
    );
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
