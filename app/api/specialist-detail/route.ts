import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  
  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = url.searchParams.get("shop_id");
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
  const user = validateInitData(url.searchParams.get("initData") ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const specialistId = url.searchParams.get("specialist_id");
  if (!specialistId) return json({ error: "specialist_id required" }, 400);

  const [spRes, ssRes, wRes, rRes] = await Promise.all([
    admin
      .from("specialists")
      .select("id, full_name, photo_url, bio, experience_years, rating")
      .eq("id", specialistId)
      .eq("shop_id", Number(shopId))
      .maybeSingle(),
    admin
      .from("specialist_services")
      .select("price, service:services ( id, name, duration_min, is_active )")
      .eq("specialist_id", specialistId),
    admin
      .from("specialist_works")
      .select("image_url, caption")
      .eq("specialist_id", specialistId)
      .order("sort_order"),
    admin
      .from("reviews")
      .select("specialist_rating, comment, created_at, client_name, service:services ( name )")
      .eq("specialist_id", specialistId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const services = (ssRes.data ?? [])
    .filter((r: any) => r.service?.is_active)
    .map((r: any) => ({
      id: r.service.id,
      name: r.service.name,
      duration_min: r.service.duration_min,
      price: r.price,
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "ru"));

  const reviews = (rRes.data ?? []).map((r: any) => ({
    rating: r.specialist_rating,
    comment: r.comment,
    created_at: r.created_at,
    client_name: r.client_name?.trim() || "Клиент",
    service_name: r.service?.name ?? null,
  }));

  return json({
    ok: true,
    data: {
      specialist: spRes.data ?? null,
      services,
      works: wRes.data ?? [],
      reviews,
      reviewCount: reviews.length,
    },
  });
}