"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function resetRetentionNotification(clientId: number) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.rpc("reset_retention_notification", { p_client: clientId });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/retention");
  return { ok: true };
}
