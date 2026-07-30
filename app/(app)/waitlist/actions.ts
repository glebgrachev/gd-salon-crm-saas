"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// 🔥 Расширенный guard — возвращает supabase + shopId
async function guard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user.id)
    .single();

  if (!admin?.shop_id) return null;

  return { supabase, shopId: admin.shop_id };
}

/** Убрать клиента из очереди (админ) */
export async function removeFromWaitlist(id: string) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что запись принадлежит этому салону
  const { data: existing } = await supabase
    .from("waitlist")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Запись не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase
    .from("waitlist")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["waiting", "offered"]);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/waitlist", "layout");
  return { ok: true };
}