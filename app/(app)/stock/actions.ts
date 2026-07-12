"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type ProductKind = "sale" | "supply";
export type BaseUnit = "pcs" | "ml" | "g";

export type ProductRow = {
  id: string;
  kind: ProductKind;
  name: string;
  sku: string | null;
  photo_url: string | null;
  description: string | null;
  base_unit: BaseUnit;
  pack_size: number;
  stock: number;
  avg_cost: number;
  price: number | null;
  low_stock: number;
  is_active: boolean;
  packs_left: number | null;
  is_low: boolean;
  margin_percent: number | null;
  profit_per_unit: number | null;
};

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  note: string | null;
  is_active: boolean;
};

export type MovementRow = {
  id: string;
  product_id: string;
  product_name: string;
  kind: string;
  qty_base: number;
  cost_base: number;
  balance_after: number;
  note: string | null;
  created_at: string;
};

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return isAdmin ? supabase : null;
}

/* ---------- товары ---------- */

export async function saveProduct(input: {
  id?: string;
  kind: ProductKind;
  name: string;
  sku: string;
  base_unit: BaseUnit;
  pack_size: number;
  price: number | null;
  low_stock: number;
  description: string;
  photo_url: string | null;
  is_active: boolean;
}) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Укажите название" };
  if (input.pack_size <= 0) return { ok: false, error: "Фасовка должна быть больше нуля" };
  if (input.kind === "sale" && (input.price == null || input.price <= 0)) {
    return { ok: false, error: "У товара на продажу должна быть цена" };
  }

  const payload = {
    kind: input.kind,
    name,
    sku: input.sku.trim() || null,
    base_unit: input.base_unit,
    pack_size: input.pack_size,
    price: input.kind === "sale" ? input.price : null,
    low_stock: Math.max(0, input.low_stock),
    description: input.description.trim() || null,
    photo_url: input.photo_url,
    is_active: input.is_active,
  };

  const admin = createAdmin();

  if (input.id) {
    const { error } = await admin.from("products").update(payload).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("products").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/stock", "layout");
  return { ok: true };
}

export async function deleteProduct(id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  // если по товару были движения — не удаляем, а деактивируем
  const { count } = await admin
    .from("stock_movements")
    .select("id", { count: "exact", head: true })
    .eq("product_id", id);

  if ((count ?? 0) > 0) {
    const { error } = await admin.from("products").update({ is_active: false }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/stock", "layout");
    return { ok: true, archived: true };
  }

  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  return { ok: true };
}

/* ---------- поставщики ---------- */

export async function saveSupplier(input: {
  id?: string;
  name: string;
  phone: string;
  email: string;
  note: string;
}) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Укажите название" };

  const payload = {
    name,
    phone: input.phone.trim() || null,
    email: input.email.trim() || null,
    note: input.note.trim() || null,
  };

  const admin = createAdmin();
  if (input.id) {
    const { error } = await admin.from("suppliers").update(payload).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("suppliers").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/stock", "layout");
  return { ok: true };
}

export async function deleteSupplier(id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin.from("suppliers").update({ is_active: false }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  return { ok: true };
}

/* ---------- приход ---------- */

export type PurchaseLine = {
  product_id: string;
  packs: number;
  pack_size: number;
  cost_total: number;
};

export async function createPurchase(input: {
  supplier_id: string | null;
  number: string;
  invoice_date: string;
  note: string;
  lines: PurchaseLine[];
}) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const lines = input.lines.filter((l) => l.product_id && l.packs > 0);
  if (lines.length === 0) return { ok: false, error: "Добавьте хотя бы одну позицию" };

  const admin = createAdmin();

  const total = lines.reduce((s, l) => s + (Number(l.cost_total) || 0), 0);

  const { data: inv, error: invErr } = await admin
    .from("purchase_invoices")
    .insert({
      supplier_id: input.supplier_id,
      number: input.number.trim() || null,
      invoice_date: input.invoice_date,
      note: input.note.trim() || null,
      total,
    })
    .select("id")
    .single();

  if (invErr || !inv) return { ok: false, error: invErr?.message ?? "Не удалось создать накладную" };

  for (const l of lines) {
    const qtyBase = l.packs * l.pack_size;

    const { error: itemErr } = await admin.from("purchase_items").insert({
      invoice_id: inv.id,
      product_id: l.product_id,
      packs: l.packs,
      pack_size: l.pack_size,
      qty_base: qtyBase,
      cost_total: l.cost_total,
    });
    if (itemErr) return { ok: false, error: itemErr.message };

    const { error: stockErr } = await admin.rpc("stock_purchase", {
      p_product: l.product_id,
      p_packs: l.packs,
      p_pack_size: l.pack_size,
      p_cost_total: l.cost_total,
      p_invoice: inv.id,
    });
    if (stockErr) return { ok: false, error: stockErr.message };
  }

  revalidatePath("/stock", "layout");
  return { ok: true, invoice_id: inv.id, total };
}

/* ---------- инвентаризация и списание ---------- */

export async function adjustStock(productId: string, newStock: number, note: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };
  if (newStock < 0) return { ok: false, error: "Остаток не может быть отрицательным" };

  const admin = createAdmin();
  const { error } = await admin.rpc("stock_adjust", {
    p_product: productId,
    p_new_stock: newStock,
    p_note: note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  return { ok: true };
}

export async function writeOff(productId: string, qty: number, note: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };
  if (qty <= 0) return { ok: false, error: "Количество должно быть больше нуля" };

  const admin = createAdmin();
  const { error } = await admin.rpc("stock_consume", {
    p_product: productId,
    p_qty: qty,
    p_kind: "writeoff",
    p_ref_type: null,
    p_ref_id: null,
    p_note: note.trim() || "Списание",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  return { ok: true };
}

/* ---------- журнал ---------- */

export async function fetchMovements(productId: string | null, limit = 100) {
  const supabase = await guard();
  if (!supabase) return { ok: false as const, error: "Нет доступа" };

  const admin = createAdmin();
  let q = admin
    .from("stock_movements")
    .select("id, product_id, kind, qty_base, cost_base, balance_after, note, created_at, product:products ( name )")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (productId) q = q.eq("product_id", productId);

  const { data, error } = await q;
  if (error) return { ok: false as const, error: error.message };

  type Raw = Omit<MovementRow, "product_name"> & { product: { name: string } | null };
  const rows: MovementRow[] = ((data as unknown as Raw[]) ?? []).map((m) => ({
    id: m.id,
    product_id: m.product_id,
    product_name: m.product?.name ?? "—",
    kind: m.kind,
    qty_base: Number(m.qty_base),
    cost_base: Number(m.cost_base),
    balance_after: Number(m.balance_after),
    note: m.note,
    created_at: m.created_at,
  }));

  return { ok: true as const, rows };
}
