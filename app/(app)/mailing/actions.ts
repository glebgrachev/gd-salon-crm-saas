// app/mailing/actions.ts

"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { sendBatch, SYNC_LIMIT } from "@/lib/broadcast";

// Guard для проверки админа
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

export async function previewRecipients(segments: string[]) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const validSegs = new Set(["new", "regular", "sleeping", "lost", "no_visits", "all"]);
  const segs = segments.filter((s) => validSegs.has(s));
  if (segs.length === 0) return { ok: true, count: 0 };

  const hasAll = segs.includes("all");
  const otherSegs = segs.filter(s => s !== "all");

  let data: { client_id: number }[] = [];

  if (hasAll) {
    const { data: allClients, error: allError } = await supabase
      .from("users")
      .select("telegram_id")
      .eq("shop_id", shopId)
      .eq("promo_opt_out", false);

    if (allError) return { ok: false, error: allError.message };
    data = allClients.map(c => ({ client_id: c.telegram_id }));
  }

  if (otherSegs.length > 0) {
    const { data: segData, error: segError } = await supabase
      .from("v_client_segments")
      .select("client_id")
      .eq("shop_id", shopId)
      .in("segment", otherSegs);

    if (segError) return { ok: false, error: segError.message };

    if (hasAll) {
      const allIds = new Set(data.map(c => c.client_id));
      for (const item of (segData ?? [])) {
        if (!allIds.has(item.client_id)) {
          data.push(item);
          allIds.add(item.client_id);
        }
      }
    } else {
      data = segData ?? [];
    }
  }

  return { ok: true, count: data.length };
}

export async function sendBroadcast(params: {
  segments: string[];
  text: string;
  cta_url?: string;
  shopId: number;
}) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId: userShopId } = g;

  // Проверяем, что shopId совпадает
  if (params.shopId !== userShopId) {
    return { ok: false, error: "Доступ запрещен" };
  }

  const admin = createAdmin();
  const { segments, text, cta_url, shopId } = params;

  const validSegs = new Set(["new", "regular", "sleeping", "lost", "no_visits", "all"]);
  const segs = segments.filter((s) => validSegs.has(s));
  if (segs.length === 0) return { ok: false, error: "no_segments" };
  if (!text) return { ok: false, error: "empty_text" };
  if (text.length > 3500) return { ok: false, error: "text_too_long" };

  // Получаем получателей
  const { data: recData, error: recErr } = await admin.rpc(
    "broadcast_recipients_for_segments",
    { p_segments: segs }
  );

  if (recErr) return { ok: false, error: recErr.message };

  const recipients = ((recData as { client_id: number }[]) ?? [])
    .map((r) => r.client_id)
    .filter(id => id > 0);

  if (recipients.length === 0) {
    return { ok: false, error: "no_recipients", total: 0 };
  }

  // Создаем запись о рассылке
  const { data: bc, error: bcErr } = await admin
    .from("broadcasts")
    .insert({
      shop_id: shopId,
      segments: segs,
      text,
      cta_url: cta_url || null,
      total: recipients.length,
      status: "sending",
    })
    .select("id")
    .single();

  if (bcErr || !bc) return { ok: false, error: bcErr?.message ?? "insert_failed" };

  // Создаем записи для каждого получателя
  const rows = recipients.map((clientId) => ({
    broadcast_id: bc.id,
    client_id: clientId,
    shop_id: shopId,
    status: "pending" as const,
  }));

  const { error: rowsErr } = await admin.from("broadcast_recipients").insert(rows);
  if (rowsErr) return { ok: false, error: rowsErr.message };

  // Отправляем
  if (recipients.length <= SYNC_LIMIT) {
    await sendBatch(admin, bc.id, recipients, text, cta_url || null);
    await admin.rpc("broadcast_recalc", { p_broadcast: bc.id });
    return { ok: true, broadcast_id: bc.id, total: recipients.length, mode: "sync" };
  }

  return { ok: true, broadcast_id: bc.id, total: recipients.length, mode: "background" };
}