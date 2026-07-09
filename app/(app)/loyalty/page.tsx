import { createClient } from "@/lib/supabase/server";
import LoyaltySettings from "./loyalty-settings";

export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("loyalty_settings")
    .select("cashback_percent, redeem_max_percent, point_value")
    .eq("id", 1)
    .maybeSingle();

  const settings = {
    cashback_percent: Number(data?.cashback_percent ?? 5),
    redeem_max_percent: Number(data?.redeem_max_percent ?? 50),
    point_value: Number(data?.point_value ?? 1),
  };

  // сводка по баллам (для наглядности)
  const { data: accs } = await supabase
    .from("loyalty_accounts")
    .select("balance, total_earned, total_spent");
  const rows = (accs as { balance: number; total_earned: number; total_spent: number }[]) ?? [];
  const stats = {
    clients: rows.filter((r) => Number(r.balance) > 0).length,
    balance: rows.reduce((s, r) => s + Number(r.balance ?? 0), 0),
    earned: rows.reduce((s, r) => s + Number(r.total_earned ?? 0), 0),
    spent: rows.reduce((s, r) => s + Number(r.total_spent ?? 0), 0),
  };

  return <LoyaltySettings initial={settings} stats={stats} />;
}
