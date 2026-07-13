"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { tgSend } from "@/lib/notify";

export type ProductKind = "sale" | "supply" | "certificate";
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
  face_value: number | null;      // номинал сертификата
  validity_days: number | null;   // через сколько дней сгорит
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
  face_value?: number | null;
  validity_days?: number | null;
}) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Укажите название" };
  if (input.pack_size <= 0) return { ok: false, error: "Фасовка должна быть больше нуля" };
  if (input.kind === "certificate") {
    if (input.price == null || input.price <= 0) {
      return { ok: false, error: "Укажите цену продажи сертификата" };
    }
    if (!input.face_value || input.face_value <= 0) {
      return { ok: false, error: "Укажите номинал сертификата" };
    }
  }
  if (input.kind === "sale" && (input.price == null || input.price <= 0)) {
    return { ok: false, error: "У товара на продажу должна быть цена" };
  }

  const sellable = input.kind === "sale" || input.kind === "certificate";

  const payload = {
    kind: input.kind,
    name,
    sku: input.sku.trim() || null,
    base_unit: input.base_unit,
    pack_size: input.pack_size,
    price: sellable ? input.price : null,
    low_stock: Math.max(0, input.low_stock),
    description: input.description.trim() || null,
    photo_url: input.photo_url,
    is_active: input.is_active,
    // только у сертификатов
    face_value:    input.kind === "certificate" ? input.face_value ?? null : null,
    validity_days: input.kind === "certificate" ? input.validity_days ?? null : null,
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

/* ---------- нормы расхода на услугу ---------- */

export type ConsumableRow = {
  service_id: string;
  product_id: string;
  qty_base: number;
};

export async function setConsumable(serviceId: string, productId: string, qtyBase: number) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };
  if (qtyBase <= 0) return { ok: false, error: "Количество должно быть больше нуля" };

  const admin = createAdmin();
  const { error } = await admin.from("service_consumables").upsert(
    { service_id: serviceId, product_id: productId, qty_base: qtyBase },
    { onConflict: "service_id,product_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  return { ok: true };
}

export async function removeConsumable(serviceId: string, productId: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin
    .from("service_consumables")
    .delete()
    .eq("service_id", serviceId)
    .eq("product_id", productId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  return { ok: true };
}

/* ---------- продажа товара ---------- */

export async function sellProduct(input: {
  product_id: string;
  qty: number;
  client_id: number | null;
  specialist_id: string | null;
  booking_id: string | null;
}) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };
  if (input.qty <= 0) return { ok: false, error: "Количество должно быть больше нуля" };

  const admin = createAdmin();
  const { data, error } = await admin.rpc("sell_product", {
    p_product: input.product_id,
    p_qty: input.qty,
    p_client: input.client_id,
    p_specialist: input.specialist_id,
    p_booking: input.booking_id,
    p_status: "paid",
  });

  if (error) return { ok: false, error: error.message };

  const res = data as { ok?: boolean; error?: string; stock?: number; total?: number };
  if (!res?.ok) {
    return {
      ok: false,
      error:
        res?.error === "out_of_stock"
          ? `Не хватает на складе (остаток ${res.stock ?? 0})`
          : res?.error === "no_price"
          ? "У товара не задана цена"
          : res?.error ?? "Не удалось продать",
    };
  }

  revalidatePath("/stock", "layout");
  revalidatePath("/", "layout");
  revalidatePath("/payouts", "layout");
  return { ok: true, total: res.total };
}

export async function cancelSale(saleId: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin.rpc("cancel_product_sale", { p_sale: saleId });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/stock", "layout");
  revalidatePath("/", "layout");
  return { ok: true };
}

export type SaleRow = {
  id: string;
  created_at: string;
  paid_at: string | null;
  qty: number;
  price: number;
  total: number;
  cost: number;
  status: string;
  product_name: string;
  client_name: string | null;
  specialist_name: string | null;
};

export async function fetchSales(limit = 100) {
  const supabase = await guard();
  if (!supabase) return { ok: false as const, error: "Нет доступа" };

  const admin = createAdmin();
  const { data, error } = await admin
    .from("product_sales")
    .select(
      "id, created_at, paid_at, qty, price, total, cost, status, product:products ( name ), client:users ( first_name, last_name, username ), specialist:specialists ( full_name )",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false as const, error: error.message };

  type Raw = {
    id: string;
    created_at: string;
    paid_at: string | null;
    qty: number;
    price: number;
    total: number;
    cost: number;
    status: string;
    product: { name: string } | null;
    client: { first_name: string | null; last_name: string | null; username: string | null } | null;
    specialist: { full_name: string } | null;
  };

  const rows: SaleRow[] = ((data as unknown as Raw[]) ?? []).map((s) => {
    const cl = s.client;
    const name = cl
      ? [cl.first_name, cl.last_name].filter(Boolean).join(" ") ||
        (cl.username ? `@${cl.username}` : null)
      : null;
    return {
      id: s.id,
      created_at: s.created_at,
      paid_at: s.paid_at,
      qty: Number(s.qty),
      price: Number(s.price),
      total: Number(s.total),
      cost: Number(s.cost),
      status: s.status,
      product_name: s.product?.name ?? "—",
      client_name: name,
      specialist_name: s.specialist?.full_name ?? null,
    };
  });

  return { ok: true as const, rows };
}

/** Отметить отложенный товар как оплаченный (клиент забрал при визите) */
export async function markSalePaid(saleId: string, specialistId: string | null) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { data, error } = await admin
    .from("product_sales")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(specialistId ? { specialist_id: specialistId } : {}),
    })
    .eq("id", saleId)
    .eq("status", "reserved")
    .select("id, client_id, product:products ( kind, name )");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Резерв не найден или уже закрыт" };

  // Если оплатили сертификат — выпускаем коды и отправляем клиенту
  type Paid = {
    id: string;
    client_id: number | null;
    product: { kind: string; name: string } | null;
  };
  const sale = (data as unknown as Paid[])[0];

  let issued = 0;

  if (sale.product?.kind === "certificate") {
    const { data: res, error: issueErr } = await admin.rpc("issue_certificates_for_sale", {
      p_sale: saleId,
    });

    if (issueErr) {
      // продажа уже проведена — откатывать не будем, но честно скажем
      return {
        ok: false,
        error: `Продажа отмечена, но сертификат не выпустился: ${issueErr.message}`,
      };
    }

    type Issued = {
      ok: boolean;
      codes: { code: string; amount: number; expires_at: string | null }[];
    };
    const out = res as unknown as Issued;
    const codes = out?.codes ?? [];
    issued = codes.length;

    if (codes.length > 0 && sale.client_id) {
      const lines = codes
        .map((c) => {
          const exp = c.expires_at
            ? `\n   Действует до ${new Date(c.expires_at).toLocaleDateString("ru-RU")}`
            : "";
          return `<code>${c.code}</code> — ${Math.round(Number(c.amount))} ₽${exp}`;
        })
        .join("\n\n");

      await tgSend(
        sale.client_id,
        `🎁 <b>Сертификат готов!</b>\n\n${lines}\n\n` +
          `Чтобы воспользоваться — введите код при записи. ` +
          `Или подарите: получателю достаточно ввести этот код у себя.`,
      );
    }
  }

  revalidatePath("/stock", "layout");
  revalidatePath("/payouts", "layout");
  revalidatePath("/certificates", "layout");
  return { ok: true, issued };
}
