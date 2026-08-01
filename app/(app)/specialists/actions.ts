"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// 🔥 Расширенный guard
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

export type SpecialistInput = {
  full_name: string;
  experience_years: number;
  bio: string;
  photo_url: string | null;
  is_active: boolean;
};

// 🔥 Проверка лимита мастеров
async function checkSpecialistLimit(supabase: any, shopId: number): Promise<{
  ok: boolean;
  current: number;
  limit: number;
  error?: string;
}> {
  // Получаем модули магазина
  const { data: shop } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();

  const limit = shop?.modules?.specialists ?? 1;
  
  // Считаем текущих мастеров
  const { count } = await supabase
    .from("specialists")
    .select("*", { count: 'exact', head: true })
    .eq("shop_id", shopId);

  const current = count ?? 0;

  if (limit === -1) {
    return { ok: true, current, limit };
  }

  if (current >= limit) {
    return {
      ok: false,
      current,
      limit,
      error: `Достигнут лимит мастеров (${current}/${limit}). Перейдите на PRO для снятия ограничений.`
    };
  }

  return { ok: true, current, limit };
}

export async function createSpecialist(input: SpecialistInput) {
  const name = input.full_name.trim();
  if (!name) return { ok: false, error: "Введите ФИО" };

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // 🔥 Проверяем лимит мастеров
  const limitCheck = await checkSpecialistLimit(supabase, shopId);
  if (!limitCheck.ok) {
    return { ok: false, error: limitCheck.error };
  }

  const { error } = await supabase.from("specialists").insert({
    full_name: name,
    experience_years: Math.max(0, Math.round(input.experience_years || 0)),
    bio: input.bio.trim() || null,
    photo_url: input.photo_url || null,
    is_active: input.is_active,
    shop_id: shopId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/specialists");
  return { ok: true };
}

export async function updateSpecialist(id: string, input: SpecialistInput) {
  const name = input.full_name.trim();
  if (!name) return { ok: false, error: "Введите ФИО" };

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что специалист принадлежит этому салону
  const { data: existing } = await supabase
    .from("specialists")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Специалист не найден или не принадлежит вашему салону" };
  }

  const { error } = await supabase
    .from("specialists")
    .update({
      full_name: name,
      experience_years: Math.max(0, Math.round(input.experience_years || 0)),
      bio: input.bio.trim() || null,
      photo_url: input.photo_url || null,
      is_active: input.is_active,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/specialists");
  return { ok: true };
}

export async function deleteSpecialist(id: string) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const { data: existing } = await supabase
    .from("specialists")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Специалист не найден или не принадлежит вашему салону" };
  }

  const { error } = await supabase.from("specialists").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/specialists");
  return { ok: true };
}