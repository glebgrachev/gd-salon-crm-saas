"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateLoyaltySettings(input: {
  cashback_percent: number;
  redeem_max_percent: number;
  point_value: number;
}) {
  const supabase = await createClient();

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const clamp = (n: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

  const payload = {
    cashback_percent: clamp(input.cashback_percent, 0, 100),
    redeem_max_percent: clamp(input.redeem_max_percent, 0, 100),
    point_value: clamp(input.point_value, 0.01, 1000),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("loyalty_settings").update(payload).eq("id", 1);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/loyalty");
  return { ok: true };
}
