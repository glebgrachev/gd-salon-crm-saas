"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateRetentionSettings(input: {
  new_days: number;
  regular_days: number;
  lost_days: number;
}) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const n = Math.round(Number(input.new_days));
  const r = Math.round(Number(input.regular_days));
  const l = Math.round(Number(input.lost_days));

  if (!(n > 0 && r > n && l > r)) {
    return { ok: false, error: "Пороги должны идти по возрастанию: Новый < Постоянный < Потерянный" };
  }

  const { error } = await supabase
    .from("retention_settings")
    .update({ new_days: n, regular_days: r, lost_days: l, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/retention");
  revalidatePath("/clients");
  return { ok: true };
}
