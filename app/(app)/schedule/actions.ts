"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type DayType = "work" | "off";

export type ScheduleDay = {
  date: string;
  day_type: DayType;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};

async function guard() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return isAdmin ? supabase : null;
}

export async function loadScheduleMonth(specialistId: string, from: string, to: string) {
  const supabase = await guard();
  if (!supabase) return { ok: false as const, error: "Нет доступа" };

  const { data, error } = await supabase
    .from("schedule_days")
    .select("date, day_type, start_time, end_time, break_start, break_end")
    .eq("specialist_id", specialistId)
    .gte("date", from)
    .lte("date", to)
    .order("date");

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, days: (data as ScheduleDay[]) ?? [] };
}

export async function saveScheduleMonth(
  specialistId: string,
  from: string,
  to: string,
  days: ScheduleDay[],
) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };

  // Валидация
  for (const d of days) {
    if (d.day_type === "work") {
      if (!d.start_time || !d.end_time) {
        return { ok: false, error: `Не задано время работы для ${d.date}` };
      }
      if (d.end_time <= d.start_time) {
        return { ok: false, error: `Конец рабочего дня раньше начала (${d.date})` };
      }
      if (d.break_start && d.break_end && d.break_end <= d.break_start) {
        return { ok: false, error: `Некорректный перерыв (${d.date})` };
      }
    }
  }

  // Используем обычный клиент (guard) вместо admin
  const { error } = await supabase.rpc("save_schedule_days", {
    p_specialist: specialistId,
    p_from: from,
    p_to: to,
    p_days: days,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/schedule", "layout");
  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true };
}

export async function extendSchedule(
  specialistId: string,
  fromMonth: string,
  months: number,
) {
  const supabase = await guard();
  if (!supabase) return { ok: false, error: "Нет доступа" };
  if (months < 1 || months > 6) return { ok: false, error: "Можно продлить на 1–6 месяцев" };

  const base = new Date(`${fromMonth}T00:00:00Z`);
  const y = base.getUTCFullYear();
  const m = base.getUTCMonth();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const srcFrom = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const srcTo = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  // Загружаем образец через обычный клиент
  const { data: src, error: srcErr } = await supabase
    .from("schedule_days")
    .select("date, day_type, start_time, end_time, break_start, break_end")
    .eq("specialist_id", specialistId)
    .gte("date", srcFrom)
    .lte("date", srcTo);

  if (srcErr) return { ok: false, error: srcErr.message };
  if (!src || src.length === 0) {
    return { ok: false, error: "Месяц-образец пуст — сначала разметьте его" };
  }

  type Slot = Omit<ScheduleDay, "date">;
  const buckets = new Map<number, Map<string, { n: number; slot: Slot }>>();

  for (const d of src as ScheduleDay[]) {
    const dow = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const slot: Slot = {
      day_type: d.day_type,
      start_time: d.start_time,
      end_time: d.end_time,
      break_start: d.break_start,
      break_end: d.break_end,
    };
    const key = JSON.stringify(slot);
    if (!buckets.has(dow)) buckets.set(dow, new Map());
    const b = buckets.get(dow)!;
    const cur = b.get(key);
    if (cur) cur.n += 1;
    else b.set(key, { n: 1, slot });
  }

  const week = new Map<number, Slot>();
  for (const [dow, variants] of buckets) {
    let best: { n: number; slot: Slot } | null = null;
    for (const v of variants.values()) {
      if (!best || v.n > best.n) best = v;
    }
    if (best) week.set(dow, best.slot);
  }

  let written = 0;
  for (let i = 1; i <= months; i++) {
    const ty = new Date(Date.UTC(y, m + i, 1)).getUTCFullYear();
    const tm = new Date(Date.UTC(y, m + i, 1)).getUTCMonth();
    const tLast = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
    const tFrom = `${ty}-${String(tm + 1).padStart(2, "0")}-01`;
    const tTo = `${ty}-${String(tm + 1).padStart(2, "0")}-${String(tLast).padStart(2, "0")}`;

    const days: ScheduleDay[] = [];
    for (let d = 1; d <= tLast; d++) {
      const dow = (new Date(Date.UTC(ty, tm, d)).getUTCDay() + 6) % 7;
      const slot = week.get(dow);
      if (!slot) continue;
      days.push({
        date: `${ty}-${String(tm + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        ...slot,
      });
    }

    const { error } = await supabase.rpc("save_schedule_days", {
      p_specialist: specialistId,
      p_from: tFrom,
      p_to: tTo,
      p_days: days,
    });
    if (error) return { ok: false, error: error.message };
    written += days.length;
  }

  revalidatePath("/schedule", "layout");
  revalidatePath(`/specialists/${specialistId}`, "layout");
  return { ok: true, months, written };
}