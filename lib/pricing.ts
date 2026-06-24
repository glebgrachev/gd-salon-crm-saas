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
