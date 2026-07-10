"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

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

export async function issueCertificate(input: { amount: number; note?: string }) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const amount = Math.round(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "Укажите номинал" };

  const admin = createAdmin();
  // до 5 попыток на случай коллизии кода
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const { data, error } = await admin
      .from("certificates")
      .insert({ code, amount, balance: amount, status: "issued", note: input.note?.trim() || null })
      .select("code")
      .single();
    if (!error && data) {
      revalidatePath("/certificates");
      return { ok: true, code: data.code };
    }
    // 23505 — unique_violation по коду: пробуем ещё раз
    if (error && error.code !== "23505") {
      return { ok: false, error: error.message };
    }
  }
  return { ok: false, error: "Не удалось сгенерировать код, попробуйте ещё раз" };
}

export async function setCertificateDisabled(id: string, disabled: boolean) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  // не трогаем использованные; переключаем issued/active <-> disabled
  const { data: cert } = await admin.from("certificates").select("status").eq("id", id).maybeSingle();
  if (!cert) return { ok: false, error: "Не найдено" };

  let next: string;
  if (disabled) next = "disabled";
  else next = cert.status === "disabled" ? "issued" : cert.status; // вернуть из disabled

  const { error } = await admin.from("certificates").update({ status: next }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/certificates");
  return { ok: true };
}
