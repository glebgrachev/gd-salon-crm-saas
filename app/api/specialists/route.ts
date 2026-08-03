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

  const admin = createAdmin();
  const { data, error } = await admin
    .from("specialists")
    .select("id, full_name, photo_url, rating, specialist_services ( price )")
    .eq("is_active", true)
    .eq("shop_id", Number(shopId))
    .order("sort_order")
    .order("created_at");

  if (error) return json({ error: error.message }, 500);

  // Форматируем как в старом API
  const formatted = (data ?? []).map((s: any) => {
    const prices = (s.specialist_services ?? []).map((x: any) => x.price);
    return {
      id: s.id,
      full_name: s.full_name,
      photo_url: s.photo_url,
      rating: s.rating,
      price_from: prices.length ? Math.min(...prices) : null,
    };
  });

  return json({ ok: true, data: formatted });
}