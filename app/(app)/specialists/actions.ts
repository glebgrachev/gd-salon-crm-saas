"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;
  return supabase;
}

export type SpecialistInput = {
  full_name: string;
  experience_years: number;
  bio: string;
  photo_url: string | null;
  is_active: boolean;
};

export async function createSpecialist(input: SpecialistInput) {
  const name = input.full_name.trim();
  if (!name) return { ok: false, error: "Введите ФИО" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("specialists").insert({
    full_name: name,
    experience_years: Math.max(0, Math.round(input.experience_years || 0)),
    bio: input.bio.trim() || null,
    photo_url: input.photo_url || null,
    is_active: input.is_active,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/specialists");
  return { ok: true };
}

export async function updateSpecialist(id: string, input: SpecialistInput) {
  const name = input.full_name.trim();
  if (!name) return { ok: false, error: "Введите ФИО" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

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
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("specialists").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/specialists");
  return { ok: true };
}
