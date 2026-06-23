"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;
  return supabase;
}

export type PromotionInput = {
  title: string;
  description: string;
  banner_url: string | null;
  discount_type: "percent" | "fixed" | null;
  discount_value: number | null;
  target_category_id: string | null;
  target_service_id: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
};

function normalize(input: PromotionInput) {
  return {
    title: input.title.trim(),
    description: input.description.trim() || null,
    banner_url: input.banner_url || null,
    discount_type: input.discount_type,
    discount_value:
      input.discount_type && input.discount_value
        ? input.discount_value
        : null,
    target_category_id: input.target_service_id ? null : input.target_category_id,
    target_service_id: input.target_service_id,
    valid_from: input.valid_from || null,
    valid_to: input.valid_to || null,
    is_active: input.is_active,
  };
}

export async function createPromotion(input: PromotionInput) {
  if (!input.title.trim()) return { ok: false, error: "Введите название" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("promotions").insert(normalize(input));
  if (error) return { ok: false, error: error.message };

  revalidatePath("/promotions");
  return { ok: true };
}

export async function updatePromotion(id: string, input: PromotionInput) {
  if (!input.title.trim()) return { ok: false, error: "Введите название" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("promotions")
    .update(normalize(input))
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/promotions");
  return { ok: true };
}

export async function deletePromotion(id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/promotions");
  return { ok: true };
}
