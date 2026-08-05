import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

type Row = {
  id: string;
  specialist_rating: number;
  service_rating: number;
  comment: string | null;
  status: string;
  created_at: string;
  booking_id: string;
  service: { name: string } | null;
  specialist: { full_name: string } | null;
};

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
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

  const { data: rows } = await admin
    .from("reviews")
    .select(
      "id, specialist_rating, service_rating, comment, status, created_at, booking_id, service:services ( name ), specialist:specialists ( full_name )",
    )
    .eq("client_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const reviews = ((rows as unknown as Row[]) ?? []).map((r) => ({
    id: r.id,
    booking_id: r.booking_id,
    specialist_rating: r.specialist_rating,
    service_rating: r.service_rating,
    comment: r.comment,
    status: r.status,
    created_at: r.created_at,
    service: r.service?.name ?? null,
    specialist: r.specialist?.full_name ?? null,
  }));

  return json({ ok: true, reviews });
}