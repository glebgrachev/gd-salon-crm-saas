import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/** Встать в очередь на занятый слот или на день */
export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    service_id?: string;
    specialist_id?: string;
    kind?: "slot" | "day";
    date?: string;
    slot?: string | null;
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

  if (!body.service_id || !body.specialist_id || !body.kind || !body.date) {
    return json({ error: "bad_request" }, 400);
  }

  const { data, error } = await admin.rpc("join_waitlist", {
    p_client: user.id,
    p_service: body.service_id,
    p_specialist: body.specialist_id,
    p_kind: body.kind,
    p_date: body.date,
    p_slot: body.kind === "slot" ? body.slot : null,
  });

  if (error) return json({ ok: false, error: error.message }, 500);
  return json(data);
}