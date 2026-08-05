import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

// GET — список избранного с деталями (для Профиля) + плоский список ключей.
export async function GET(req: Request) {
  const url = new URL(req.url);
  
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
  const user = validateInitData(url.searchParams.get("initData") ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: rows } = await admin
    .from("favorites")
    .select("kind, target_id")
    .eq("client_id", user.id);

  const favs = (rows as { kind: string; target_id: string }[]) ?? [];
  const specIds = favs.filter((f) => f.kind === "specialist").map((f) => f.target_id);
  const svcIds = favs.filter((f) => f.kind === "service").map((f) => f.target_id);

  const [spRes, svRes] = await Promise.all([
    specIds.length
      ? admin.from("specialists").select("id, full_name, photo_url, rating").in("id", specIds).eq("is_active", true)
      : Promise.resolve({ data: [] }),
    svcIds.length
      ? admin.from("services").select("id, name, duration_min, image_url").in("id", svcIds).eq("is_active", true)
      : Promise.resolve({ data: [] }),
  ]);

  const keys = favs.map((f) => `${f.kind}:${f.target_id}`);

  return json({
    ok: true,
    keys,
    specialists: spRes.data ?? [],
    services: svRes.data ?? [],
  });
}

// POST — переключить избранное. Тело: { initData, shop_id, kind, target_id }
export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
    kind?: string;
    target_id?: string;
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

  if ((body.kind !== "specialist" && body.kind !== "service") || !body.target_id) {
    return json({ error: "bad_request" }, 400);
  }

  const { data: existing } = await admin
    .from("favorites")
    .select("id")
    .eq("client_id", user.id)
    .eq("kind", body.kind)
    .eq("target_id", body.target_id)
    .maybeSingle();

  if (existing) {
    await admin.from("favorites").delete().eq("id", existing.id);
    return json({ ok: true, favorite: false });
  }

  const { error } = await admin.from("favorites").insert({
    client_id: user.id,
    kind: body.kind,
    target_id: body.target_id,
  });
  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, favorite: true });
}