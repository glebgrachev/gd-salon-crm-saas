import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");

  if (!shopId) {
    return json({ error: "shopId обязателен" }, 400);
  }

  const admin = createAdmin();

  const { data: services, error } = await admin
    .from("services")
    .select("id, name, duration_min, price")
    .eq("shop_id", Number(shopId))
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("❌ Ошибка загрузки услуг:", error);
    return json({ error: "Ошибка загрузки услуг" }, 500);
  }

  return json({ ok: true, services: services || [] });
}