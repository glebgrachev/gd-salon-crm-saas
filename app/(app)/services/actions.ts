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

export async function createCategory(parentId: string | null, name: string) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Введите название" };

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

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
    .insert({ parent_id: parentId, name: n, level, shop_id: shopId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function renameCategory(id: string, name: string) {
  const n = name.trim();
  if (!n) return { ok: false, error: "Введите название" };

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase } = g;

  // Проверяем, что категория принадлежит этому салону
  const { data: category } = await supabase
    .from("categories")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!category || category.shop_id !== g.shopId) {
    return { ok: false, error: "Нет доступа к этой категории" };
  }

  const { error } = await supabase
    .from("categories")
    .update({ name: n })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что категория принадлежит этому салону
  const { data: category } = await supabase
    .from("categories")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!category || category.shop_id !== shopId) {
    return { ok: false, error: "Нет доступа к этой категории" };
  }

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

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что категория принадлежит этому салону
  const { data: category } = await supabase
    .from("categories")
    .select("shop_id")
    .eq("id", categoryId)
    .single();

  if (!category || category.shop_id !== shopId) {
    return { ok: false, error: "Категория не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase
    .from("services")
    .insert({
      category_id: categoryId,
      name: n,
      duration_min: Math.round(durationMin),
      shop_id: shopId,
    });
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

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что услуга принадлежит этому салону
  const { data: service } = await supabase
    .from("services")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!service || service.shop_id !== shopId) {
    return { ok: false, error: "Услуга не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase
    .from("services")
    .update({ name: n, duration_min: Math.round(durationMin) })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}

export async function deleteService(id: string) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что услуга принадлежит этому салону
  const { data: service } = await supabase
    .from("services")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!service || service.shop_id !== shopId) {
    return { ok: false, error: "Услуга не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase.from("services").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/services");
  return { ok: true };
}