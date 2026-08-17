import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/** Все слоты дня с пометкой занятости — чтобы клиент мог встать в очередь */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  
  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = searchParams.get("shop_id");
  if (!shopId) {
    console.error('❌ shop_id не передан');
    return json({ error: "shop_id_required" }, 400);
  }

  const admin = createAdmin();

  // ===== 2. ПОЛУЧАЕМ ТОКЕН БОТА ИЗ ТАБЛИЦЫ shops =====
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  // ===== 3. ПРОВЕРЯЕМ initData С ТОКЕНОМ САЛОНА =====
  const user = validateInitData(searchParams.get("initData") ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const specialist = searchParams.get("specialist");
  const service = searchParams.get("service");
  const date = searchParams.get("date");

  if (!specialist || !service || !date) {
    return json({ error: "bad_request" }, 400);
  }

  // ===== 4. ПОЛУЧАЕМ busyRanges ИЗ ЗАПРОСА =====
  let busyRanges: { starts_at: string; ends_at: string }[] = [];
  const busyRangesParam = searchParams.get("busyRanges");
  if (busyRangesParam) {
    try {
      busyRanges = JSON.parse(decodeURIComponent(busyRangesParam));
    } catch {
      // игнорируем ошибки парсинга
    }
  }

  // ===== 5. ВЫЗЫВАЕМ RPC С p_tz =====
  const { data, error } = await admin.rpc("get_day_slots", {
    p_specialist_id: specialist,
    p_service_id: service,
    p_date: date,
    p_tz: "Europe/Moscow",  // 👈 ДОБАВЬ ЭТУ СТРОКУ
    p_busy_ranges: busyRanges.length > 0 ? busyRanges : null,
  });

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, slots: data ?? [] });
}