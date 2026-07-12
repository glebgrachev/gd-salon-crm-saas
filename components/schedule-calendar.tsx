"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  loadScheduleMonth,
  saveScheduleMonth,
  type ScheduleDay,
  type DayType,
} from "@/app/(app)/schedule/actions";

type DayState = {
  type: DayType | null; // null = не задан (серый)
  start: string;
  end: string;
  breakStart: string;
  breakEnd: string;
};

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function iso(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function monthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // пн = 0
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "";
}

export default function ScheduleCalendar({
  specialistId,
  title = "График работы",
  subtitle = "Задайте время работы, затем отмечайте дни. Клик переключает: не задан → рабочий → выходной.",
}: {
  specialistId: string;
  title?: string;
  subtitle?: string;
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("20:00");
  const [brStart, setBrStart] = useState("14:00");
  const [brEnd, setBrEnd] = useState("15:00");
  const [useBreak, setUseBreak] = useState(true);

  const [days, setDays] = useState<Record<string, DayState>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, startSaving] = useTransition();

  const from = iso(year, month, 1);
  const to = iso(year, month, new Date(year, month + 1, 0).getDate());

  const load = useCallback(async () => {
    if (!specialistId) return;
    setLoading(true);
    const r = await loadScheduleMonth(specialistId, from, to);
    if (r.ok) {
      const map: Record<string, DayState> = {};
      for (const d of r.days) {
        map[d.date] = {
          type: d.day_type,
          start: hhmm(d.start_time),
          end: hhmm(d.end_time),
          breakStart: hhmm(d.break_start),
          breakEnd: hhmm(d.break_end),
        };
      }
      setDays(map);
      setDirty(false);
    } else {
      toast.error(r.error);
    }
    setLoading(false);
  }, [specialistId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  function cycle(dateStr: string) {
    setDays((prev) => {
      const next = { ...prev };
      const cur = next[dateStr]?.type ?? null;
      if (cur === null) {
        next[dateStr] = {
          type: "work",
          start,
          end,
          breakStart: useBreak ? brStart : "",
          breakEnd: useBreak ? brEnd : "",
        };
      } else if (cur === "work") {
        next[dateStr] = { type: "off", start: "", end: "", breakStart: "", breakEnd: "" };
      } else {
        delete next[dateStr];
      }
      return next;
    });
    setDirty(true);
  }

  function applyPreset(mask: number[]) {
    const total = new Date(year, month + 1, 0).getDate();
    setDays((prev) => {
      const next = { ...prev };
      for (let d = 1; d <= total; d++) {
        const dow = (new Date(year, month, d).getDay() + 6) % 7;
        const key = iso(year, month, d);
        if (mask.includes(dow)) {
          next[key] = {
            type: "work",
            start,
            end,
            breakStart: useBreak ? brStart : "",
            breakEnd: useBreak ? brEnd : "",
          };
        } else {
          delete next[key];
        }
      }
      return next;
    });
    setDirty(true);
  }

  function clearMonth() {
    setDays({});
    setDirty(true);
  }

  function applyTimeToWork() {
    setDays((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) {
        if (next[k].type === "work") {
          next[k] = {
            type: "work",
            start,
            end,
            breakStart: useBreak ? brStart : "",
            breakEnd: useBreak ? brEnd : "",
          };
        }
      }
      return next;
    });
    setDirty(true);
  }

  function save() {
    const payload: ScheduleDay[] = Object.entries(days).map(([date, s]) => ({
      date,
      day_type: s.type as DayType,
      start_time: s.type === "work" ? s.start : null,
      end_time: s.type === "work" ? s.end : null,
      break_start: s.type === "work" && s.breakStart ? s.breakStart : null,
      break_end: s.type === "work" && s.breakEnd ? s.breakEnd : null,
    }));

    startSaving(async () => {
      const r = await saveScheduleMonth(specialistId, from, to, payload);
      if (r.ok) {
        toast.success("График сохранён");
        setDirty(false);
        load();
      } else {
        toast.error(r.error ?? "Не удалось сохранить");
      }
    });
  }

  function shiftMonth(delta: number) {
    if (dirty && !confirm("Есть несохранённые изменения. Перейти без сохранения?")) return;
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const cells = monthGrid(year, month);
  const workCount = Object.values(days).filter((d) => d.type === "work").length;
  const offCount = Object.values(days).filter((d) => d.type === "off").length;
  const todayStr = iso(now.getFullYear(), now.getMonth(), now.getDate());

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
      <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>

      {/* панель времени + пресеты */}
      <div className="mt-5 rounded-lg border border-neutral-200 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-neutral-500">Начало</label>
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500">Конец</label>
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>

          <label className="flex items-center gap-2 pb-2 text-xs text-neutral-700">
            <input
              type="checkbox"
              checked={useBreak}
              onChange={(e) => setUseBreak(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Перерыв
          </label>

          {useBreak && (
            <>
              <div>
                <label className="block text-xs text-neutral-500">Перерыв с</label>
                <input
                  type="time"
                  value={brStart}
                  onChange={(e) => setBrStart(e.target.value)}
                  className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500">до</label>
                <input
                  type="time"
                  value={brEnd}
                  onChange={(e) => setBrEnd(e.target.value)}
                  className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
                />
              </div>
            </>
          )}

          <button
            onClick={applyTimeToWork}
            className="ml-auto rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            Применить ко всем рабочим
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-4">
          <span className="text-xs text-neutral-500">Быстрое заполнение:</span>
          <Preset label="Пн–Пт" onClick={() => applyPreset([0, 1, 2, 3, 4])} />
          <Preset label="Пн–Сб" onClick={() => applyPreset([0, 1, 2, 3, 4, 5])} />
          <Preset label="Все дни" onClick={() => applyPreset([0, 1, 2, 3, 4, 5, 6])} />
          <Preset label="Сб–Вс" onClick={() => applyPreset([5, 6])} />
          <button
            onClick={clearMonth}
            className="rounded-md bg-neutral-100 px-2.5 py-1.5 text-xs font-medium text-neutral-500 transition hover:bg-red-50 hover:text-red-600"
          >
            Очистить месяц
          </button>
        </div>
      </div>

      {/* календарь */}
      <div className="mt-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => shiftMonth(-1)}
            className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-sm font-semibold text-neutral-900">
            {MONTHS[month]} {year}
          </div>
          <button
            onClick={() => shiftMonth(1)}
            className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {WD.map((w) => (
            <div key={w} className="pb-1 text-center text-xs font-medium text-neutral-400">
              {w}
            </div>
          ))}

          {loading
            ? Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
              ))
            : cells.map((d, i) => {
                if (d === null) return <div key={`e${i}`} />;
                const key = iso(year, month, d);
                const st = days[key];
                const isToday = key === todayStr;

                const cls =
                  st?.type === "work"
                    ? "bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200"
                    : st?.type === "off"
                    ? "bg-red-100 border-red-300 text-red-800 hover:bg-red-200"
                    : "bg-neutral-50 border-neutral-200 text-neutral-400 hover:bg-neutral-100";

                return (
                  <button
                    key={key}
                    onClick={() => cycle(key)}
                    className={`h-16 rounded-lg border p-1.5 text-left transition ${cls} ${
                      isToday ? "ring-2 ring-neutral-900 ring-offset-1" : ""
                    }`}
                  >
                    <div className="text-sm font-semibold">{d}</div>
                    {st?.type === "work" && (
                      <div className="mt-0.5 text-[10px] leading-tight">
                        {st.start}–{st.end}
                        {st.breakStart && (
                          <div className="text-emerald-700/70">
                            ⏸ {st.breakStart}–{st.breakEnd}
                          </div>
                        )}
                      </div>
                    )}
                    {st?.type === "off" && (
                      <div className="mt-0.5 text-[10px] font-medium">Выходной</div>
                    )}
                  </button>
                );
              })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-500">
            <Legend cls="bg-emerald-100 border-emerald-300" label={`Рабочих: ${workCount}`} />
            <Legend cls="bg-red-100 border-red-300" label={`Выходных: ${offCount}`} />
            <Legend cls="bg-neutral-50 border-neutral-200" label="Не задан" />
          </div>

          <div className="flex items-center gap-3">
            {dirty && <span className="text-xs text-amber-600">Есть несохранённые изменения</span>}
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Preset({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md bg-neutral-100 px-2.5 py-1.5 text-xs font-medium text-neutral-700 transition hover:bg-neutral-200"
    >
      {label}
    </button>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border ${cls}`} />
      {label}
    </span>
  );
}
