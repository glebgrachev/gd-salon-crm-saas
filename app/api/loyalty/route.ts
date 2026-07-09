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
  const user = validateInitData(url.searchParams.get("initData") ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();

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
