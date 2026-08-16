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

export async function previewRecipients(segments: string[]) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const validSegs = new Set(["new", "regular", "sleeping", "lost", "no_visits", "all"]);
  const segs = segments.filter((s) => validSegs.has(s));
  if (segs.length === 0) return { ok: true, count: 0 };

  // Получаем клиентов этого салона
  const { data, error } = await supabase
    .from("v_client_segments")
    .select("client_id")
    .eq("shop_id", shopId)
    .in("segment", segs);

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: (data ?? []).length };
}