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

  const serviceId = url.searchParams.get("service_id");
  if (!serviceId) return json({ error: "service_id required" }, 400);

  // Получаем детали услуги
  const { data: svc, error: svcError } = await admin
    .from("services")
    .select("id, name, image_url, duration_min, description")
    .eq("id", serviceId)
    .eq("shop_id", Number(shopId))
    .maybeSingle();

  if (svcError) return json({ error: svcError.message }, 500);
  if (!svc) return json({ error: "service not found" }, 404);

  // Получаем мастеров для услуги
  const { data: masters, error: mastersError } = await admin
    .from("specialist_services")
    .select("price, specialist:specialists ( id, full_name, photo_url, rating, is_active )")
    .eq("service_id", serviceId);

  if (mastersError) return json({ error: mastersError.message }, 500);

  const formattedMasters = (masters ?? [])
    .filter((m: any) => m.specialist?.is_active)
    .map((m: any) => ({
      id: m.specialist.id,
      full_name: m.specialist.full_name,
      photo_url: m.specialist.photo_url,
      rating: m.specialist.rating,
      price: m.price,
    }))
    .sort((a: any, b: any) => a.price - b.price);

  return json({
    ok: true,
    data: {
      service: svc,
      masters: formattedMasters,
    },
  });
}