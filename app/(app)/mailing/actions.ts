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

  // ✅ Проверяем, есть ли "all" в выбранных сегментах
  const hasAll = segs.includes("all");
  const otherSegs = segs.filter(s => s !== "all");

  let data = [];

  if (hasAll) {
    // ✅ Если выбран "all" - берем ВСЕХ клиентов салона
    const { data: allClients, error: allError } = await supabase
      .from("users")
      .select("telegram_id")
      .eq("shop_id", shopId)
      .eq("promo_opt_out", false);

    if (allError) return { ok: false, error: allError.message };
    data = allClients.map(c => ({ client_id: c.telegram_id }));
  }

  // ✅ Если выбраны другие сегменты - добавляем их
  if (otherSegs.length > 0) {
    const { data: segData, error: segError } = await supabase
      .from("v_client_segments")
      .select("client_id")
      .eq("shop_id", shopId)
      .in("segment", otherSegs);

    if (segError) return { ok: false, error: segError.message };
    
    if (hasAll) {
      // Если есть "all" - объединяем и убираем дубликаты
      const allIds = new Set(data.map(c => c.client_id));
      for (const item of (segData ?? [])) {
        if (!allIds.has(item.client_id)) {
          data.push(item);
          allIds.add(item.client_id);
        }
      }
    } else {
      data = segData ?? [];
    }
  }

  return { ok: true, count: data.length };
}