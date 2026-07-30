import { createClient } from "@/lib/supabase/server";
import PayoutsClient, { type PayoutRow } from "./payouts-client";

export const dynamic = "force-dynamic";

function monthBounds(d = new Date()) {
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

export default async function PayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const def = monthBounds();
  const from = sp.from ?? def.from;
  const to = sp.to ?? def.to;

  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Вызываем RPC без p_shop_id
  const { data, error } = await supabase.rpc("payout_report", {
    p_from: from,
    p_to: to,
  });

  // 3. Фильтруем данные на клиенте (если в функции нет shop_id)
  const filteredData = ((data as PayoutRow[]) ?? [])
    .filter((row: PayoutRow) => row.shop_id === shopId);

  return (
    <PayoutsClient
      from={from}
      to={to}
      rows={filteredData}
      error={error?.message ?? null}
    />
  );
}