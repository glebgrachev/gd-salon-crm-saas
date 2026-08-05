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

  const specialistId = url.searchParams.get("specialist_id");
  if (!specialistId) return json({ error: "specialist_id required" }, 400);

  const [svcRes, mRes, ssRes] = await Promise.all([
    admin
      .from("services")
      .select("name, duration_min")
      .eq("id", serviceId)
      .eq("shop_id", Number(shopId))
      .maybeSingle(),
    admin
      .from("specialists")
      .select("full_name, photo_url")
      .eq("id", specialistId)
      .eq("shop_id", Number(shopId))
      .maybeSingle(),
    admin
      .from("specialist_services")
      .select("price")
      .eq("service_id", serviceId)
      .eq("specialist_id", specialistId)
      .maybeSingle(),
  ]);

  return json({
    ok: true,
    data: {
      service: svcRes.data ?? null,
      master: mRes.data ?? null,
      basePrice: (ssRes.data as any)?.price ?? null,
    },
  });
}