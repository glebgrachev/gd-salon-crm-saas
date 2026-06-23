"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;
  return supabase;
}

export async function createCategory(parentId: string | null, name: string) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Введите название" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  let level = 1;
  if (parentId) {
    const { data: parent } = await supabase
      .from("categories")
      .select("level")
      .eq("id", parentId)
      .maybeSingle();
    level = (parent?.level ?? 0) + 1;
  }

  const { error } = await supabase
    .from("categories")
    .insert({ parent_id: parentId, name: n, level });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function renameCategory(id: string, name: string) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Введите название" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("categories")
    .update({ name: n })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function createService(
  categoryId: string,
  name: string,
  durationMin: number,
) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Введите название" };
  if (!Number.isFinite(durationMin) || durationMin <= 0)
    return { ok: false, error: "Длительность должна быть больше 0" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("services")
    .insert({ category_id: categoryId, name: n, duration_min: Math.round(durationMin) });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function updateService(
  id: string,
  name: string,
  durationMin: number,
) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Введите название" };
  if (!Number.isFinite(durationMin) || durationMin <= 0)
    return { ok: false, error: "Длительность должна быть больше 0" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("services")
    .update({ name: n, duration_min: Math.round(durationMin) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function deleteService(id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}
