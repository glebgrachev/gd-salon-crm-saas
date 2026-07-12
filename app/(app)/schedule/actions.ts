"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export type DayType = "work" | "off";

export type ScheduleDay = {
  date: string; // YYYY-MM-DD
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

  // валидация
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

  const admin = createAdmin();
  const { error } = await admin.rpc("save_schedule_days", {
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
