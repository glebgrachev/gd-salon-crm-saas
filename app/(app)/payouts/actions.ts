"use server";

import { createClient } from "@/lib/supabase/server";

export type DetailRow = {
  booking_id: string;
  starts_at: string;
  service_name: string;
  client_name: string;
  amount: number;
  payout_type: string;
  payout_value: number;
  payout: number;
};

export async function fetchPayoutDetail(specialistId: string, from: string, to: string) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false as const, error: "Нет доступа" };

  const { data, error } = await supabase.rpc("payout_detail", {
    p_specialist: specialistId,
    p_from: from,
    p_to: to,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, rows: (data as DetailRow[]) ?? [] };
}
