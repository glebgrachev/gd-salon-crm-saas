import type { SupabaseClient } from "@supabase/supabase-js";

export type Priced = {
  full_price: number;
  discount_amount: number;
  final_price: number;
  promo_id: string | null;
  promo_title: string | null;
};

/**
 * Считает цену одной услуги у конкретного мастера с учётом активной
 * скидочной акции (процент/фикс на услугу или её категорию).
 */
export async function priceService(
  admin: SupabaseClient,
  serviceId: string,
  specialistId: string,
): Promise<Priced | { error: string }> {
  // базовая цена мастера за услугу
  const { data: ss } = await admin
    .from("specialist_services")
    .select("price")
    .eq("service_id", serviceId)
    .eq("specialist_id", specialistId)
    .maybeSingle();
  if (!ss) return { error: "Мастер не оказывает эту услугу" };
  const full = Number(ss.price);

  // категория услуги + цепочка предков (для акций на категорию)
  const { data: svc } = await admin
    .from("services")
    .select("category_id")
    .eq("id", serviceId)
    .maybeSingle();

  const ancestors = new Set<string>();
  if (svc?.category_id) {
    const { data: cats } = await admin.from("categories").select("id, parent_id");
    const parentOf = new Map<string, string | null>(
      ((cats as { id: string; parent_id: string | null }[]) ?? []).map((c) => [c.id, c.parent_id]),
    );
    let cur: string | null | undefined = svc.category_id;
    let guard = 0;
    while (cur && guard++ < 10) {
      ancestors.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }

  // активные скидочные акции
  const today = new Date().toISOString().slice(0, 10);
  const { data: promos } = await admin
    .from("promotions")
    .select("id, title, discount_type, discount_value, target_service_id, target_category_id, valid_from, valid_to")
    .eq("kind", "discount")
    .eq("is_active", true);

  let best = { amount: 0, id: null as string | null, title: null as string | null };
  for (const p of (promos as {
    id: string; title: string;
    discount_type: "percent" | "fixed" | null; discount_value: number | null;
    target_service_id: string | null; target_category_id: string | null;
    valid_from: string | null; valid_to: string | null;
  }[]) ?? []) {
    if (p.valid_from && p.valid_from > today) continue;
    if (p.valid_to && p.valid_to < today) continue;
    if (!p.discount_type || !p.discount_value) continue;
    const matches =
      p.target_service_id === serviceId ||
      (p.target_category_id != null && ancestors.has(p.target_category_id)) ||
      (p.target_service_id == null && p.target_category_id == null); // на весь салон
    if (!matches) continue;
    const amount =
      p.discount_type === "percent"
        ? Math.round((full * p.discount_value) / 100)
        : Math.min(full, p.discount_value);
    if (amount > best.amount) best = { amount, id: p.id, title: p.title };
  }

  return {
    full_price: full,
    discount_amount: best.amount,
    final_price: full - best.amount,
    promo_id: best.id,
    promo_title: best.title,
  };
}

export type CartItemIn = { service_id: string; specialist_id: string };
export type CartPriced = {
  items: {
    service_id: string;
    specialist_id: string;
    full_price: number;
    discount_amount: number;
    final_price: number;
    promo_title: string | null;
    error?: string;
  }[];
  gifts: {
    promo_id: string;
    promo_title: string;
    gift_service_id: string;
    gift_service_name: string;
    gift_discount_percent: number;
  }[];
  subtotal: number;
  discount_total: number;
  total: number;
};

// Расчёт всей корзины: по каждой позиции — скидка; затем определяем подарки
// (комплексы), у которых все услуги-триггеры присутствуют в корзине.
export async function priceCart(
  admin: SupabaseClient,
  items: CartItemIn[],
): Promise<CartPriced> {
  const priced: CartPriced["items"] = [];
  for (const it of items) {
    const r = await priceService(admin, it.service_id, it.specialist_id);
    if ("error" in r) {
      priced.push({
        service_id: it.service_id,
        specialist_id: it.specialist_id,
        full_price: 0,
        discount_amount: 0,
        final_price: 0,
        promo_title: null,
        error: r.error,
      });
    } else {
      priced.push({ service_id: it.service_id, specialist_id: it.specialist_id, ...r });
    }
  }

  // подарки/комплексы
  const today = new Date().toISOString().slice(0, 10);
  const serviceSet = new Set(items.map((i) => i.service_id));
  const { data: giftPromos } = await admin
    .from("promotions")
    .select("id, title, gift_service_id, gift_discount_percent, valid_from, valid_to")
    .eq("kind", "gift")
    .eq("is_active", true);
  const { data: trig } = await admin
    .from("promotion_triggers")
    .select("promotion_id, service_id");

  const triggersByPromo = new Map<string, string[]>();
  for (const t of (trig as { promotion_id: string; service_id: string }[]) ?? []) {
    const arr = triggersByPromo.get(t.promotion_id) ?? [];
    arr.push(t.service_id);
    triggersByPromo.set(t.promotion_id, arr);
  }

  const gifts: CartPriced["gifts"] = [];
  const giftServiceIds: string[] = [];
  for (const p of (giftPromos as {
    id: string; title: string; gift_service_id: string | null;
    gift_discount_percent: number | null; valid_from: string | null; valid_to: string | null;
  }[]) ?? []) {
    if (p.valid_from && p.valid_from > today) continue;
    if (p.valid_to && p.valid_to < today) continue;
    if (!p.gift_service_id) continue;
    const triggers = triggersByPromo.get(p.id) ?? [];
    if (triggers.length === 0) continue;
    const allPresent = triggers.every((t) => serviceSet.has(t));
    if (!allPresent) continue;
    // не дублируем услугу-подарок, если она уже выбрана как обычная позиция
    if (serviceSet.has(p.gift_service_id)) continue;
    gifts.push({
      promo_id: p.id,
      promo_title: p.title,
      gift_service_id: p.gift_service_id,
      gift_service_name: "",
      gift_discount_percent: p.gift_discount_percent ?? 100,
    });
    giftServiceIds.push(p.gift_service_id);
  }

  if (giftServiceIds.length) {
    const { data: gs } = await admin
      .from("services")
      .select("id, name")
      .in("id", giftServiceIds);
    const nameById = new Map(((gs as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name]));
    for (const g of gifts) g.gift_service_name = nameById.get(g.gift_service_id) ?? "Подарок";
  }

  const subtotal = priced.reduce((s, i) => s + i.full_price, 0);
  const discount_total = priced.reduce((s, i) => s + i.discount_amount, 0);
  const total = priced.reduce((s, i) => s + i.final_price, 0);

  return { items: priced, gifts, subtotal, discount_total, total };
}
