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
    .from("categories")
    .select("id, name, image_url")
    .is("parent_id", null)
    .eq("is_active", true)
    .eq("shop_id", Number(shopId))
    .order("sort_order")
    .order("name");

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, data: data ?? [] });
}