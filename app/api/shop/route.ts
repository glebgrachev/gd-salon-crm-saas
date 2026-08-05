import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

// Витрина: товары в наличии и подарочные сертификаты
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

  const { data, error } = await admin
    .from("v_shop_products")
    .select("id, kind, name, photo_url, description, price, face_value, validity_days")
    .eq("shop_id", Number(shopId))
    .order("kind")      // certificate, sale
    .order("price");

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, products: data ?? [] });
}