import { createClient } from "@/lib/supabase/server";
import LoyaltySettings from "./loyalty-settings";

export const dynamic = "force-dynamic";

export default async function LoyaltyPage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем настройки ТОЛЬКО для этого салона
  const { data } = await supabase
    .from("loyalty_settings")
    .select("cashback_percent, redeem_max_percent, point_value")
    .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
    .maybeSingle();

  const settings = {
    cashback_percent: Number(data?.cashback_percent ?? 5),
    redeem_max_percent: Number(data?.redeem_max_percent ?? 50),
    point_value: Number(data?.point_value ?? 1),
  };

  // 3. Сводка по баллам ТОЛЬКО для этого салона
  const { data: accs } = await supabase
    .from("loyalty_accounts")
    .select("balance, total_earned, total_spent")
    .eq("shop_id", shopId); // 👈 ФИЛЬТР ПО САЛОНУ

  const rows = (accs as { balance: number; total_earned: number; total_spent: number }[]) ?? [];
  const stats = {
    clients: rows.filter((r) => Number(r.balance) > 0).length,
    balance: rows.reduce((s, r) => s + Number(r.balance ?? 0), 0),
    earned: rows.reduce((s, r) => s + Number(r.total_earned ?? 0), 0),
    spent: rows.reduce((s, r) => s + Number(r.total_spent ?? 0), 0),
  };

  return <LoyaltySettings initial={settings} stats={stats} />;
}