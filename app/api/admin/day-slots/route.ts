import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  const specialist = url.searchParams.get("specialist");
  const service = url.searchParams.get("service");
  const date = url.searchParams.get("date");

  if (!shopId || !specialist || !service || !date) {
    return json({ error: "Недостаточно параметров" }, 400);
  }

  try {
    const admin = createAdmin();

    // Вызываем RPC функцию напрямую
    const { data, error } = await admin.rpc("get_day_slots", {
      p_specialist_id: specialist,
      p_service_id: service,
      p_date: date,
      p_tz: "Europe/Moscow",
      p_busy_ranges: null,
    });

    if (error) {
      console.error("❌ [Admin] Ошибка RPC:", error);
      return json({ error: error.message }, 500);
    }

    console.log("✅ [Admin] Загружено слотов:", data?.length || 0);
    return json({ ok: true, slots: data ?? [] });
  } catch (error) {
    console.error("❌ [Admin] Ошибка получения слотов:", error);
    return json({ error: "Внутренняя ошибка сервера" }, 500);
  }
}