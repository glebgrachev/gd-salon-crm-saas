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

  const { data, error } = await admin
    .from("specialist_services")
    .select("price, specialist:specialists ( id, full_name, photo_url, rating, is_active )")
    .eq("service_id", serviceId)
    .eq("shop_id", Number(shopId));

  if (error) return json({ error: error.message }, 500);

  const formatted = (data ?? [])
    .filter((r: any) => r.specialist?.is_active)
    .map((r: any) => ({
      id: r.specialist.id,
      full_name: r.specialist.full_name,
      photo_url: r.specialist.photo_url,
      rating: r.specialist.rating,
      price: r.price,
    }))
    .sort((a: any, b: any) => b.rating - a.rating);

  return json({ ok: true, data: formatted });
}