import { createClient } from "@/lib/supabase/server";
import RetentionClient from "./retention-client";

export const dynamic = "force-dynamic";

type Row = {
  client_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  visits: number;
  last_visit: string | null;
  days_since_last: number | null;
  segment: string;
  retention_notified_at: string | null;
};

export default async function RetentionPage() {
  const supabase = await createClient();

  const [{ data: rowsRaw }, { data: cfg }] = await Promise.all([
    supabase
      .from("v_client_segments")
      .select("client_id, first_name, last_name, username, visits, last_visit, days_since_last, segment, retention_notified_at"),
    supabase.from("retention_settings").select("new_days, regular_days, lost_days").eq("id", 1).maybeSingle(),
  ]);

  const rows = (rowsRaw as Row[]) ?? [];
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.segment] = (acc[r.segment] ?? 0) + 1;
    return acc;
  }, {});

  const away = rows
    .filter((r) => r.segment === "sleeping" || r.segment === "lost")
    .sort((a, b) => (b.days_since_last ?? 0) - (a.days_since_last ?? 0))
    .slice(0, 100);

  return (
    <RetentionClient
      counts={counts}
      total={rows.length}
      settings={{
        new_days: Number(cfg?.new_days ?? 30),
        regular_days: Number(cfg?.regular_days ?? 60),
        lost_days: Number(cfg?.lost_days ?? 120),
      }}
      away={away}
    />
  );
}
