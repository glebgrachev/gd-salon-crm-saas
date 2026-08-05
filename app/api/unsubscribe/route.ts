import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    broadcast_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

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