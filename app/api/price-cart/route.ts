import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { priceCart, type CartItemIn } from "@/lib/pricing";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: { initData?: string; items?: CartItemIn[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json({ error: "empty_cart" }, 400);
  }

  const admin = createAdmin();
  const result = await priceCart(admin, body.items);
  return json(result);
}
