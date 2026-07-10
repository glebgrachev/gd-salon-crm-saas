import { createClient } from "@/lib/supabase/server";
import CertificatesManager from "./certificates-manager";

export const dynamic = "force-dynamic";

type CertRow = {
  id: string;
  code: string;
  amount: number;
  balance: number;
  status: string;
  activated_by: number | null;
  activated_at: string | null;
  expires_at: string | null;
  note: string | null;
  created_at: string;
};

export default async function CertificatesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("certificates")
    .select("id, code, amount, balance, status, activated_by, activated_at, expires_at, note, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const certs = (data as CertRow[]) ?? [];

  // имена активировавших
  const ids = [...new Set(certs.map((c) => c.activated_by).filter(Boolean))] as number[];
  const names = new Map<number, string>();
  if (ids.length) {
    const { data: users } = await supabase
      .from("users")
      .select("telegram_id, first_name, last_name, username")
      .in("telegram_id", ids);
    for (const u of (users as { telegram_id: number; first_name: string | null; last_name: string | null; username: string | null }[]) ?? []) {
      names.set(
        u.telegram_id,
        [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ? "@" + u.username : String(u.telegram_id)),
      );
    }
  }

  const rows = certs.map((c) => ({ ...c, activated_name: c.activated_by ? names.get(c.activated_by) ?? null : null }));

  const stats = {
    total: certs.length,
    active: certs.filter((c) => c.status === "active").length,
    issuedNominal: certs.reduce((s, c) => s + Number(c.amount), 0),
    remaining: certs
      .filter((c) => c.status === "active")
      .reduce((s, c) => s + Number(c.balance), 0),
  };

  return <CertificatesManager rows={rows} stats={stats} />;
}
