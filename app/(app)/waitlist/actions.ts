"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return isAdmin ? supabase : null;
}

/** Убрать клиента из очереди (админ) */
export async function removeFromWaitlist(id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin
    .from("waitlist")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["waiting", "offered"]);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/waitlist", "layout");
  return { ok: true };
}
