import { createAdmin } from "@/lib/supabase/admin";
import { sendReactivation } from "@/lib/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  client_id: number;
  first_name: string | null;
  segment: string;
  days_since_last: number | null;
  shop_id: number; // 👈 Добавляем shop_id
};

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createAdmin();

  // берём тех, кто уже в «Спящем» и кому мы ещё ни разу не отправляли напоминание
  const { data } = await admin
    .from("v_client_segments")
    .select("client_id, first_name, segment, days_since_last, retention_notified_at, shop_id") // 👈 Добавляем shop_id
    .eq("segment", "sleeping")
    .is("retention_notified_at", null)
    .limit(200);

  const rows = (data as (Row & { retention_notified_at: string | null })[]) ?? [];
  let sent = 0;

  // ===== КЭШ ТОКЕНОВ ДЛЯ САЛОНОВ =====
  const tokenCache = new Map<number, string>();

  async function getBotToken(shopId: number): Promise<string | null> {
    if (tokenCache.has(shopId)) return tokenCache.get(shopId)!;
    
    const { data: shop, error } = await admin
      .from("shops")
      .select("bot_token")
      .eq("id", shopId)
      .maybeSingle();
    
    if (error || !shop?.bot_token) {
      console.error(`❌ Токен для салона ${shopId} не найден`);
      return null;
    }
    
    tokenCache.set(shopId, shop.bot_token);
    return shop.bot_token;
  }

  for (const r of rows) {
    // Получаем токен для салона
    const botToken = await getBotToken(r.shop_id);
    if (!botToken) continue;

    // Передаём botToken в sendReactivation
    const ok = await sendReactivation(
      r.client_id,
      r.first_name,
      r.days_since_last,
      botToken // 👈 ПЕРЕДАЁМ ТОКЕН
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