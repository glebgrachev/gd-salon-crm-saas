import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

// GET — баланс баллов, итоги, ставка кешбэка и последние операции клиента.
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

  const [acc, tx, cfg] = await Promise.all([
    admin.from("loyalty_accounts").select("balance, total_earned, total_spent").eq("client_id", user.id).maybeSingle(),
    admin
      .from("loyalty_transactions")
      .select("kind, points, note, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    admin.from("loyalty_settings").select("cashback_percent, redeem_max_percent, point_value").eq("id", 1).maybeSingle(),
  ]);

  const account = acc.data ?? { balance: 0, total_earned: 0, total_spent: 0 };

  return json({
    ok: true,
    balance: Number(account.balance ?? 0),
    total_earned: Number(account.total_earned ?? 0),
    total_spent: Number(account.total_spent ?? 0),
    cashback_percent: Number(cfg.data?.cashback_percent ?? 0),
    redeem_max_percent: Number(cfg.data?.redeem_max_percent ?? 0),
    point_value: Number(cfg.data?.point_value ?? 1),
    transactions: tx.data ?? [],
  });
}