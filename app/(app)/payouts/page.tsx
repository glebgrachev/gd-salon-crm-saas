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
  const { data, error } = await supabase.rpc("payout_report", { p_from: from, p_to: to });

  return (
    <PayoutsClient
      from={from}
      to={to}
      rows={(data as PayoutRow[]) ?? []}
      error={error?.message ?? null}
    />
  );
}
