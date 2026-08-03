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
  const user = validateInitData(url.searchParams.get("initData") ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const shopId = url.searchParams.get("shop_id");
  if (!shopId) return json({ error: "shop_id required" }, 400);

  const serviceId = url.searchParams.get("service_id");
  if (!serviceId) return json({ error: "service_id required" }, 400);

  const admin = createAdmin();

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