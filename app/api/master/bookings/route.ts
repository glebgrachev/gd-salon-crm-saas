import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    from?: string;
    to?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = body.shop_id;
  if (!shopId) {
    console.error('❌ shop_id не передан');
    return json({ error: "shop_id_required" }, 400);
  }

  const admin = createAdmin();

  // ===== 2. ПОЛУЧАЕМ ТОКЕН БОТА ИЗ ТАБЛИЦЫ shops =====
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  // ===== 3. ПРОВЕРЯЕМ initData С ТОКЕНОМ САЛОНА =====
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: me } = await admin.rpc("whoami_specialist", { p_telegram: user.id });
  const spec = (me as { ok?: boolean; specialist_id?: string } | null);
  if (!spec?.ok || !spec.specialist_id) return json({ error: "not_linked" }, 403);

  const today = new Date().toISOString().slice(0, 10);
  const from = body.from ?? today;
  const to = body.to ?? today;

  const { data, error } = await admin.rpc("specialist_bookings", {
    p_specialist: spec.specialist_id,
    p_from: from,
    p_to: to,
  });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, bookings: data ?? [] });
}