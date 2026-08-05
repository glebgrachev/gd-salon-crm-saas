import { createAdmin } from "@/lib/supabase/admin";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/** Все слоты дня с пометкой занятости — чтобы клиент мог встать в очередь */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const specialist = searchParams.get("specialist");
  const service = searchParams.get("service");
  const date = searchParams.get("date");

  if (!specialist || !service || !date) {
    return json({ error: "bad_request" }, 400);
  }

  // Получаем часовой пояс из заголовков или используем UTC
  const timezone = req.headers.get('x-timezone') || 'UTC';

  const admin = createAdmin();
  const { data, error } = await admin.rpc("get_day_slots", {
    p_specialist_id: specialist,
    p_service_id: service,
    p_date: date,
    p_tz: timezone, // <-- ДОБАВЛЕНО!
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, slots: data ?? [] });
}