import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const shopId = url.searchParams.get("shopId");

    console.log("🔍 API services: shopId =", shopId);

    if (!shopId) {
      return json({ error: "shopId обязателен" }, 400);
    }

    const admin = createAdmin();

    // 1. Получаем услуги
    const { data: services, error } = await admin
      .from("services")
      .select("id, name, duration_min")
      .eq("shop_id", Number(shopId))
      .eq("is_active", true)
      .order("name");

    if (error) {
      console.error("❌ API services: ошибка запроса:", error);
      return json({ error: "Ошибка загрузки услуг", details: error.message }, 500);
    }

    // 2. Для каждой услуги получаем минимальную цену из specialist_services
    const servicesWithPrice = await Promise.all(
      (services || []).map(async (service) => {
        const { data: prices } = await admin
          .from("specialist_services")
          .select("price")
          .eq("service_id", service.id)
          .eq("shop_id", Number(shopId));

        const minPrice = prices?.length ? Math.min(...prices.map(p => p.price)) : null;
        
        return {
          ...service,
          price: minPrice,
        };
      })
    );

    console.log("✅ API services: найдено услуг:", servicesWithPrice.length);
    return json({ ok: true, services: servicesWithPrice });

  } catch (error: any) {
    console.error("❌ API services: критическая ошибка:", error);
    return json({ 
      error: "Внутренняя ошибка сервера", 
      details: error?.message || "Unknown error" 
    }, 500);
  }
}