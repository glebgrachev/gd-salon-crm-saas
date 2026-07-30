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

// без похожих символов (0/O, 1/I) — код диктуется голосом/переписывается
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomBlock(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
function genCode() {
  return `BS-${randomBlock(4)}-${randomBlock(4)}`;
}

export async function issueCertificate(input: { amount: number; note?: string; expires_at?: string }) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Укажите номинал" };

  let expires_at: string | null = null;
  if (input.expires_at && input.expires_at.trim()) {
    const d = input.expires_at.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { ok: false, error: "Неверная дата" };
    const today = new Date().toISOString().slice(0, 10);
    if (d < today) return { ok: false, error: "Дата в прошлом" };
    expires_at = d;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { data, error } = await supabase
      .from("certificates")
      .insert({
        code,
        amount,
        balance: amount,
        status: "issued",
        note: input.note?.trim() || null,
        expires_at,
        shop_id: shopId,
      })
      .select("code")
      .single();
    if (!error && data) {
      revalidatePath("/certificates");
      return { ok: true, code: data.code };
    }
    if (error && error.code !== "23505") {
      return { ok: false, error: error.message };
    }
  }
  return { ok: false, error: "Не удалось сгенерировать код, попробуйте ещё раз" };
}

export async function setCertificateDisabled(id: string, disabled: boolean) {
  const g = await guard();
  if (!g) return { ok: false, error: "Нет доступа" };
  const { supabase, shopId } = g;

  // Проверяем, что сертификат принадлежит этому салону
  const { data: existing } = await supabase
    .from("certificates")
    .select("status, shop_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.shop_id !== shopId) {
    return { ok: false, error: "Сертификат не найден или не принадлежит вашему салону" };
  }

  // не трогаем использованные; переключаем issued/active <-> disabled
  const cert = existing;
  let next: string;
  if (disabled) next = "disabled";
  else next = cert.status === "disabled" ? "issued" : cert.status;

  const { error } = await supabase
    .from("certificates")
    .update({ status: next })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/certificates");
  return { ok: true };
}