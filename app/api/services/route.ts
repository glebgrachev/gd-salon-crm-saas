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

  const categoryId = url.searchParams.get("category_id");
  if (!categoryId) return json({ error: "category_id required" }, 400);
  
  // Сначала получаем все ID категорий-потомков
  const { data: categories } = await admin
    .from("categories")
    .select("id, parent_id")
    .eq("shop_id", Number(shopId));
  
  // Простая проверка: если category_id не корневая, ищем потомков
  let categoryIds = [categoryId];
  if (categories) {
    const descendants: string[] = [];
    const collect = (parentId: string) => {
      for (const cat of categories) {
        if (cat.parent_id === parentId && !descendants.includes(cat.id)) {
          descendants.push(cat.id);
          collect(cat.id);
        }
      }
    };
    collect(categoryId);
    categoryIds = [categoryId, ...descendants];
  }

  const { data, error } = await admin
    .from("services")
    .select("id, name, image_url, duration_min, category_id, specialist_services ( price )")
    .in("category_id", categoryIds)
    .eq("is_active", true)
    .eq("shop_id", Number(shopId))
    .order("name");

  if (error) return json({ error: error.message }, 500);

  const formatted = (data ?? []).map((s: any) => {
    const prices = (s.specialist_services ?? []).map((x: any) => x.price);
    return {
      id: s.id,
      name: s.name,
      image_url: s.image_url,
      duration_min: s.duration_min,
      category_id: s.category_id,
      price_from: prices.length ? Math.min(...prices) : null,
    };
  });

  return json({ ok: true, data: formatted });
}