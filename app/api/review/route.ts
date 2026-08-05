import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

// GET — контекст для экрана отзыва (услуга/мастер + не оставлен ли уже).
// initData передаётся как query-параметр, т.к. это GET.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const bookingId = url.searchParams.get("booking_id") ?? "";
  const initData = url.searchParams.get("initData") ?? "";

  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = url.searchParams.get("shop_id");
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
  const user = validateInitData(initData, shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  if (!bookingId) return json({ error: "bad_request" }, 400);

  const { data: booking } = await admin
    .from("bookings")
    .select("id, client_id, service:services ( name ), specialist:specialists ( full_name )")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return json({ error: "not_found" }, 404);
  if (booking.client_id !== user.id) return json({ error: "forbidden" }, 403);

  const { data: existing } = await admin
    .from("reviews")
    .select("id, specialist_rating, service_rating, comment, status")
    .eq("booking_id", bookingId)
    .maybeSingle();

  const svc = booking.service as { name: string } | null;
  const sp = booking.specialist as { full_name: string } | null;

  return json({
    ok: true,
    service: svc?.name ?? null,
    specialist: sp?.full_name ?? null,
    existing: existing ?? null,
  });
}

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    booking_id?: string;
    specialist_rating?: number;
    service_rating?: number;
    comment?: string;
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

  const sr = Number(body.specialist_rating);
  const vr = Number(body.service_rating);
  if (!body.booking_id || !(sr >= 1 && sr <= 5) || !(vr >= 1 && vr <= 5)) {
    return json({ error: "bad_request" }, 400);
  }

  const { data: booking } = await admin
    .from("bookings")
    .select("id, client_id, specialist_id, service_id, ends_at")
    .eq("id", body.booking_id)
    .maybeSingle();

  if (!booking) return json({ error: "not_found" }, 404);
  if (booking.client_id !== user.id) return json({ error: "forbidden" }, 403);
  if (new Date(booking.ends_at).getTime() > Date.now()) {
    return json({ error: "too_early" }, 400);
  }

  const comment = (body.comment ?? "").trim().slice(0, 1000) || null;

  // имя автора: «Имя Ф.» — храним прямо в отзыве, чтобы не раскрывать таблицу users
  const fn = (user.first_name ?? "").trim();
  const ln = (user.last_name ?? "").trim();
  const clientName =
    (fn + (ln ? ` ${ln[0]}.` : "")).trim() ||
    (user.username ? `@${user.username}` : "Клиент");

  // upsert по уникальному booking_id — повторная отправка перезапишет и вернёт на модерацию
  const { error } = await admin.from("reviews").upsert(
    {
      booking_id: booking.id,
      client_id: user.id,
      specialist_id: booking.specialist_id,
      service_id: booking.service_id,
      specialist_rating: sr,
      service_rating: vr,
      comment,
      client_name: clientName,
      status: "pending",
    },
    { onConflict: "booking_id" },
  );

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true });
}