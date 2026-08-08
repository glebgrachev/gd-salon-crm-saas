import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    booking_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = body.shop_id;
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
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  // ===== 🔥 ПРОВЕРКА НА ЗАМОРОЗКУ =====
  const { data: userData, error: userError } = await admin
    .from("users")
    .select("frozen")
    .eq("telegram_id", user.id)
    .maybeSingle();

  if (!userError && userData?.frozen === true) {
    console.warn('⚠️ Попытка отмены переноса записи замороженным пользователем:', user.id);
    return json({ 
      ok: false, 
      error: 'User is frozen',
      message: 'Функционал приложения временно ограничен. Пожалуйста, обратитесь к администратору салона.'
    }, 403);
  }

  if (!body.booking_id) return json({ error: "bad_request" }, 400);

  const { data, error } = await admin.rpc("cancel_reschedule", {
    p_booking: body.booking_id,
    p_client: user.id,
  });
  if (error) return json({ error: error.message }, 500);
  return json(data);
}