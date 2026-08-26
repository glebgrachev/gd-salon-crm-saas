import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const shopId = url.searchParams.get("shopId");

  if (!shopId) {
    return json({ error: "shopId обязателен" }, 400);
  }

  const admin = createAdmin();

  const { data: clients, error } = await admin
    .from("users")
    .select("telegram_id, first_name, last_name, phone, is_guest")
    .eq("shop_id", Number(shopId))
    .or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`
    )
    .limit(20);

  if (error) {
    console.error("❌ Ошибка поиска клиентов:", error);
    return json({ error: "Ошибка поиска" }, 500);
  }

  return json({ ok: true, clients });
}