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

  const specialistId = url.searchParams.get("specialist_id");
  if (!specialistId) return json({ error: "specialist_id required" }, 400);

  const admin = createAdmin();

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