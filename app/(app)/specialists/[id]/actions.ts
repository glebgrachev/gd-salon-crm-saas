"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return null;
  return supabase;
}

const t = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

export type DayRow = {
  weekday: number;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};

export async function saveWeeklySchedule(
  specialistId: string,
  days: DayRow[],
) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const rows = days.map((d) => ({
    specialist_id: specialistId,
    weekday: d.weekday,
    is_working: d.is_working,
    start_time: d.is_working ? t(d.start_time) : null,
    end_time: d.is_working ? t(d.end_time) : null,
    break_start: d.is_working ? t(d.break_start) : null,
    break_end: d.is_working ? t(d.break_end) : null,
  }));

  const { error } = await supabase
    .from("specialist_schedules")
    .upsert(rows, { onConflict: "specialist_id,weekday" });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

export type ExceptionInput = {
  date: string;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};

export async function addException(
  specialistId: string,
  input: ExceptionInput,
) {
  if (!input.date) return { ok: false, error: "Укажите дату" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("schedule_exceptions")
    .upsert(
      {
        specialist_id: specialistId,
        date: input.date,
        is_working: input.is_working,
        start_time: input.is_working ? t(input.start_time) : null,
        end_time: input.is_working ? t(input.end_time) : null,
        break_start: input.is_working ? t(input.break_start) : null,
        break_end: input.is_working ? t(input.break_end) : null,
      },
      { onConflict: "specialist_id,date" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

export async function deleteException(specialistId: string, id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("schedule_exceptions")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

// ---------- услуги мастера с ценой ----------

export async function setSpecialistService(
  specialistId: string,
  serviceId: string,
  price: number,
) {
  if (!serviceId) return { ok: false, error: "Выберите услугу" };
  if (!Number.isFinite(price) || price < 0)
    return { ok: false, error: "Некорректная цена" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("specialist_services")
    .upsert(
      { specialist_id: specialistId, service_id: serviceId, price: Math.round(price) },
      { onConflict: "specialist_id,service_id" },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

export async function removeSpecialistService(
  specialistId: string,
  serviceId: string,
) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("specialist_services")
    .delete()
    .eq("specialist_id", specialistId)
    .eq("service_id", serviceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

// ---------- портфолио ----------

export async function addWork(
  specialistId: string,
  imageUrl: string,
  caption: string,
) {
  if (!imageUrl) return { ok: false, error: "Нет изображения" };
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("specialist_works").insert({
    specialist_id: specialistId,
    image_url: imageUrl,
    caption: caption.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

export async function deleteWork(specialistId: string, id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase.from("specialist_works").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

// ---------- модерация отзывов ----------

export async function setReviewStatus(
  specialistId: string,
  reviewId: string,
  status: "approved" | "rejected" | "pending",
) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const { error } = await supabase
    .from("reviews")
    .update({ status })
    .eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`);
  return { ok: true };
}

/* ---------- оплата труда ---------- */

export type PayoutRules = {
  payout_type: "percent" | "fixed";
  payout_value: number;
  salary_month: number;
  salary_mode: "full_month" | "by_days" | "by_shifts";
  shift_rate: number;
};

export async function savePayoutRules(specialistId: string, rules: PayoutRules) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const num = (v: unknown, lo: number, hi: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  };

  const payload = {
    payout_type: rules.payout_type === "fixed" ? "fixed" : "percent",
    payout_value:
      rules.payout_type === "percent"
        ? num(rules.payout_value, 0, 100)
        : num(rules.payout_value, 0, 1_000_000),
    salary_month: num(rules.salary_month, 0, 10_000_000),
    salary_mode: ["full_month", "by_days", "by_shifts"].includes(rules.salary_mode)
      ? rules.salary_mode
      : "by_days",
    shift_rate: num(rules.shift_rate, 0, 1_000_000),
  };

  const admin = createAdmin();
  const { data, error } = await admin
    .from("specialists")
    .update(payload)
    .eq("id", specialistId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Мастер не найден" };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  revalidatePath("/payouts", "layout");
  return { ok: true };
}

export async function setServicePayout(
  specialistId: string,
  serviceId: string,
  payoutType: "percent" | "fixed",
  payoutValue: number,
) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const v = Number(payoutValue);
  if (!Number.isFinite(v) || v < 0) return { ok: false, error: "Некорректное значение" };
  if (payoutType === "percent" && v > 100) return { ok: false, error: "Процент не может быть больше 100" };

  const admin = createAdmin();
  const { error } = await admin.from("specialist_service_payouts").upsert(
    {
      specialist_id: specialistId,
      service_id: serviceId,
      payout_type: payoutType,
      payout_value: v,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "specialist_id,service_id" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  revalidatePath("/payouts", "layout");
  return { ok: true };
}

export async function removeServicePayout(specialistId: string, serviceId: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin
    .from("specialist_service_payouts")
    .delete()
    .eq("specialist_id", specialistId)
    .eq("service_id", serviceId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  revalidatePath("/payouts", "layout");
  return { ok: true };
}

/* ---------- документы мастера ---------- */

export type DocType = "diploma" | "certificate" | "license" | "medical" | "contract" | "other";

export async function addDocument(input: {
  specialistId: string;
  docType: DocType;
  title: string;
  filePath: string;
  mimeType: string;
  sizeBytes: number;
  expiresAt: string | null;
  isPublic: boolean;
}) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const title = input.title.trim();
  if (!title) return { ok: false, error: "Укажите название документа" };
  if (!input.filePath) return { ok: false, error: "Файл не загружен" };

  const admin = createAdmin();
  const { error } = await admin.from("specialist_documents").insert({
    specialist_id: input.specialistId,
    doc_type: input.docType,
    title,
    file_path: input.filePath,
    mime_type: input.mimeType,
    size_bytes: input.sizeBytes,
    expires_at: input.expiresAt || null,
    is_public: input.isPublic,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${input.specialistId}`, "layout");
  return { ok: true };
}

export async function deleteDocument(specialistId: string, id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();

  const { data: doc } = await admin
    .from("specialist_documents")
    .select("file_path")
    .eq("id", id)
    .eq("specialist_id", specialistId)
    .maybeSingle();

  if (doc?.file_path) {
    await admin.storage.from("docs").remove([doc.file_path]);
  }

  const { error } = await admin
    .from("specialist_documents")
    .delete()
    .eq("id", id)
    .eq("specialist_id", specialistId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true };
}

export async function toggleDocumentPublic(specialistId: string, id: string, isPublic: boolean) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin
    .from("specialist_documents")
    .update({ is_public: isPublic })
    .eq("id", id)
    .eq("specialist_id", specialistId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true };
}

// Ссылка на скачивание для админа (signed URL, живёт 5 минут)
export async function getDocumentUrl(specialistId: string, id: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false as const, error: "Нет доступа" };

  const admin = createAdmin();
  const { data: doc } = await admin
    .from("specialist_documents")
    .select("file_path")
    .eq("id", id)
    .eq("specialist_id", specialistId)
    .maybeSingle();

  if (!doc?.file_path) return { ok: false as const, error: "Документ не найден" };

  const { data, error } = await admin.storage
    .from("docs")
    .createSignedUrl(doc.file_path, 300);
  if (error || !data) return { ok: false as const, error: error?.message ?? "Ошибка ссылки" };

  return { ok: true as const, url: data.signedUrl };
}

/* ---------- доступ мастера в Mini App ---------- */

export async function saveSpecialistPhone(specialistId: string, phone: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const clean = phone.trim();
  const digits = clean.replace(/\D/g, "");
  if (clean && digits.length < 10) return { ok: false, error: "Слишком короткий номер" };

  const admin = createAdmin();
  const { error } = await admin
    .from("specialists")
    .update({ phone: clean || null })
    .eq("id", specialistId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true };
}

function genCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без 0/O/1/I
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function generateLinkCode(specialistId: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false as const, error: "Нет доступа" };

  const code = genCode();
  const expires = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const admin = createAdmin();
  const { error } = await admin
    .from("specialists")
    .update({ link_code: code, link_code_expires_at: expires })
    .eq("id", specialistId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true as const, code, expires };
}

export async function unlinkSpecialist(specialistId: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  const admin = createAdmin();
  const { error } = await admin
    .from("specialists")
    .update({ telegram_id: null, link_code: null, link_code_expires_at: null })
    .eq("id", specialistId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true };
}
