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

export type PromotionInput = {
  kind: "discount" | "gift";
  title: string;
  description: string;
  banner_url: string | null;
  // discount
  discount_type: "percent" | "fixed" | null;
  discount_value: number | null;
  target_category_id: string | null;
  target_service_id: string | null;
  // gift / combo
  gift_service_id: string | null;
  gift_discount_percent: number | null;
  triggers: string[];
  // common
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
};

function row(input: PromotionInput, shopId: number) {
  const isGift = input.kind === "gift";
  return {
    kind: input.kind,
    title: input.title.trim(),
    description: input.description.trim() || null,
    banner_url: input.banner_url || null,
    discount_type: isGift ? null : input.discount_type,
    discount_value:
      !isGift && input.discount_type && input.discount_value
        ? input.discount_value
        : null,
    target_category_id: isGift
      ? null
      : input.target_service_id
        ? null
        : input.target_category_id,
    target_service_id: isGift ? null : input.target_service_id,
    gift_service_id: isGift ? input.gift_service_id : null,
    gift_discount_percent: isGift ? (input.gift_discount_percent ?? 100) : null,
    valid_from: input.valid_from || null,
    valid_to: input.valid_to || null,
    is_active: input.is_active,
    shop_id: shopId,
  };
}

async function writeTriggers(
  supabase: any,
  promotionId: string,
  kind: string,
  triggers: string[],
  shopId: number,
) {
  await supabase.from("promotion_triggers").delete().eq("promotion_id", promotionId);
  if (kind === "gift" && triggers.length) {
    await supabase.from("promotion_triggers").insert(
      triggers.map((service_id) => ({
        promotion_id: promotionId,
        service_id,
        shop_id: shopId,
      })),
    );
  }
}

export async function createPromotion(input: PromotionInput) {
  if (!input.title.trim()) return { ok: false, error: "Введите название" };
  if (input.kind === "gift" && !input.gift_service_id)
    return { ok: false, error: "Выберите услугу-подарок" };
  if (input.kind === "gift" && input.triggers.length === 0)
    return { ok: false, error: "Добавьте хотя бы одну услугу-триггер" };

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const { data, error } = await supabase
    .from("promotions")
    .insert(row(input, shopId))
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await writeTriggers(supabase, data.id, input.kind, input.triggers, shopId);

  revalidatePath("/promotions");
  return { ok: true };
}

export async function updatePromotion(id: string, input: PromotionInput) {
  if (!input.title.trim()) return { ok: false, error: "Введите название" };
  if (input.kind === "gift" && !input.gift_service_id)
    return { ok: false, error: "Выберите услугу-подарок" };
  if (input.kind === "gift" && input.triggers.length === 0)
    return { ok: false, error: "Добавьте хотя бы одну услугу-триггер" };

  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что акция принадлежит этому салону
  const { data: existing } = await supabase
    .from("promotions")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Акция не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase
    .from("promotions")
    .update(row(input, shopId))
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await writeTriggers(supabase, id, input.kind, input.triggers, shopId);

  revalidatePath("/promotions");
  return { ok: true };
}

export async function deletePromotion(id: string) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что акция принадлежит этому салону
  const { data: existing } = await supabase
    .from("promotions")
    .select("shop_id")
    .eq("id", id)
    .single();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Акция не найдена или не принадлежит вашему салону" };
  }

  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/promotions");
  return { ok: true };
}