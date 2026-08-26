import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  const serviceId = url.searchParams.get("serviceId");

  if (!shopId) {
    return json({ error: "shopId обязателен" }, 400);
  }

  const admin = createAdmin();

  // Если передан serviceId — получаем мастеров через specialist_services (как fetchServiceMasters)
  if (serviceId) {
    const { data: specialistServices, error: ssError } = await admin
      .from("specialist_services")
      .select("price, specialist:specialists ( id, full_name, is_active )")
      .eq("service_id", serviceId)
      .eq("shop_id", Number(shopId));

    if (ssError) {
      console.error("❌ Ошибка загрузки специалистов услуги:", ssError);
      return json({ error: "Ошибка загрузки мастеров" }, 500);
    }

    const specialists = (specialistServices || [])
      .filter((ss) => ss.specialist?.is_active)
      .map((ss) => ({
        id: ss.specialist!.id,
        full_name: ss.specialist!.full_name,
        price: ss.price,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));

    return json({ ok: true, specialists });
  }

  // Если serviceId не передан — возвращаем всех мастеров
  const { data: specialists, error } = await admin
    .from("specialists")
    .select("id, full_name")
    .eq("shop_id", Number(shopId))
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    console.error("❌ Ошибка загрузки мастеров:", error);
    return json({ error: "Ошибка загрузки мастеров" }, 500);
  }

  return json({ ok: true, specialists: specialists || [] });
}