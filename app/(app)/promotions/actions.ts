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

function row(input: PromotionInput) {
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
  };
}

async function writeTriggers(
  supabase: NonNullable<Awaited<ReturnType<typeof guard>>>,
  promotionId: string,
  kind: string,
  triggers: string[],
) {
  await supabase.from("promotion_triggers").delete().eq("promotion_id", promotionId);
  if (kind === "gift" && triggers.length) {
    await supabase.from("promotion_triggers").insert(
      triggers.map((service_id) => ({ promotion_id: promotionId, service_id })),
    );
  }
}

export async function createPromotion(input: PromotionInput) {
  if (!input.title.trim()) return { ok: false, error: "Введите название" };
  if (input.kind === "gift" && !input.gift_service_id)
    return { ok: false, error: "Выберите услугу-подарок" };
  if (input.kind === "gift" && input.triggers.length === 0)
    return { ok: false, error: "Добавьте хотя бы одну услугу-триггер" };

  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { data, error } = await supabase
    .from("promotions")
    .insert(row(input))
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await writeTriggers(supabase, data.id, input.kind, input.triggers);

  revalidatePath("/promotions");
  return { ok: true };
}

export async function updatePromotion(id: string, input: PromotionInput) {
  if (!input.title.trim()) return { ok: false, error: "Введите название" };
  if (input.kind === "gift" && !input.gift_service_id)
    return { ok: false, error: "Выберите услугу-подарок" };
  if (input.kind === "gift" && input.triggers.length === 0)
    return { ok: false, error: "Добавьте хотя бы одну услугу-триггер" };

  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("promotions").update(row(input)).eq("id", id);
  if (error) return { ok: false, error: error.message };

  await writeTriggers(supabase, id, input.kind, input.triggers);

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
