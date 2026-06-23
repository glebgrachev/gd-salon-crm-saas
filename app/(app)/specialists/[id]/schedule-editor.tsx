"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveWeeklySchedule,
  addException,
  deleteException,
  type DayRow,
} from "./actions";

export type Schedule = {
  weekday: number;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};
export type Exception = {
  id: string;
  date: string;
  is_working: boolean;
  start_time: string | null;
  end_time: string | null;
  break_start: string | null;
  break_end: string | null;
};
type Specialist = {
  id: string;
  full_name: string;
  photo_url: string | null;
  experience_years: number;
  rating: number;
};

// порядок отображения: Пн..Вс (weekday: 0=Вс)
const DAYS: { weekday: number; label: string }[] = [
  { weekday: 1, label: "Понедельник" },
  { weekday: 2, label: "Вторник" },
  { weekday: 3, label: "Среда" },
  { weekday: 4, label: "Четверг" },
  { weekday: 5, label: "Пятница" },
  { weekday: 6, label: "Суббота" },
  { weekday: 0, label: "Воскресенье" },
];

const hm = (v: string | null) => (v ? v.slice(0, 5) : "");

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(iso + "T00:00:00"));
}

type Row = {
  is_working: boolean;
  start: string;
  end: string;
  bStart: string;
  bEnd: string;
};

export default function ScheduleEditor({
  specialist,
  schedules,
  exceptions,
}: {
  specialist: Specialist;
  schedules: Schedule[];
  exceptions: Exception[];
}) {
  const [pending, startTransition] = useTransition();

  const [rows, setRows] = useState<Record<number, Row>>(() => {
    const map: Record<number, Row> = {};
    for (const d of DAYS) {
      const s = schedules.find((x) => x.weekday === d.weekday);
      map[d.weekday] = {
        is_working: s?.is_working ?? false,
        start: hm(s?.start_time ?? null) || "10:00",
        end: hm(s?.end_time ?? null) || "19:00",
        bStart: hm(s?.break_start ?? null),
        bEnd: hm(s?.break_end ?? null),
      };
    }
    return map;
  });

  function setRow(wd: number, patch: Partial<Row>) {
    setRows((prev) => ({ ...prev, [wd]: { ...prev[wd], ...patch } }));
  }

  function saveWeek() {
    const days: DayRow[] = DAYS.map((d) => {
      const r = rows[d.weekday];
      return {
        weekday: d.weekday,
        is_working: r.is_working,
        start_time: r.start || null,
        end_time: r.end || null,
        break_start: r.bStart || null,
        break_end: r.bEnd || null,
      };
    });
    // лёгкая валидация
    for (const d of DAYS) {
      const r = rows[d.weekday];
      if (r.is_working && r.start >= r.end) {
        toast.error(`${d.label}: время начала должно быть раньше конца`);
        return;
      }
    }
    startTransition(async () => {
      const res = await saveWeeklySchedule(specialist.id, days);
      if (!res.ok) toast.error(res.error ?? "Ошибка");
      else toast.success("Расписание сохранено");
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Link
        href="/specialists"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft size={15} /> Все мастера
      </Link>

      <div className="flex items-center gap-4">
        {specialist.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={specialist.photo_url}
            alt={specialist.full_name}
            className="size-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
            {initials(specialist.full_name)}
          </div>
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
            {specialist.full_name}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-neutral-500">
            <span className="inline-flex items-center gap-0.5">
              <Star size={13} className="fill-amber-400 text-amber-400" />
              {specialist.rating?.toFixed(1) ?? "0.0"}
            </span>
            <span>· {specialist.experience_years} лет опыта</span>
          </div>
        </div>
      </div>

      {/* Недельный шаблон */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">
            Рабочая неделя
          </h2>
          <Button size="sm" onClick={saveWeek} disabled={pending}>
            Сохранить расписание
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {DAYS.map((d, i) => {
            const r = rows[d.weekday];
            return (
              <div
                key={d.weekday}
                className={`flex flex-wrap items-center gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-neutral-100" : ""
                } ${r.is_working ? "" : "bg-neutral-50/50"}`}
              >
                <label className="flex w-36 shrink-0 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={r.is_working}
                    onChange={(e) =>
                      setRow(d.weekday, { is_working: e.target.checked })
                    }
                    className="size-4 rounded border-neutral-300"
                  />
                  <span
                    className={
                      r.is_working ? "text-neutral-800" : "text-neutral-400"
                    }
                  >
                    {d.label}
                  </span>
                </label>

                {r.is_working ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-600">
                    <input
                      type="time"
                      value={r.start}
                      onChange={(e) =>
                        setRow(d.weekday, { start: e.target.value })
                      }
                      className="h-8 rounded-lg border border-input bg-transparent px-2"
                    />
                    <span className="text-neutral-400">–</span>
                    <input
                      type="time"
                      value={r.end}
                      onChange={(e) => setRow(d.weekday, { end: e.target.value })}
                      className="h-8 rounded-lg border border-input bg-transparent px-2"
                    />
                    <span className="ml-2 text-neutral-400">перерыв</span>
                    <input
                      type="time"
                      value={r.bStart}
                      onChange={(e) =>
                        setRow(d.weekday, { bStart: e.target.value })
                      }
                      className="h-8 rounded-lg border border-input bg-transparent px-2"
                    />
                    <span className="text-neutral-400">–</span>
                    <input
                      type="time"
                      value={r.bEnd}
                      onChange={(e) =>
                        setRow(d.weekday, { bEnd: e.target.value })
                      }
                      className="h-8 rounded-lg border border-input bg-transparent px-2"
                    />
                  </div>
                ) : (
                  <span className="text-sm text-neutral-400">Выходной</span>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Перерыв можно оставить пустым. Слоты нарезаются по длительности услуги
          в пределах рабочих часов минус перерыв.
        </p>
      </section>

      {/* Исключения */}
      <ExceptionsBlock
        specialistId={specialist.id}
        exceptions={exceptions}
        pending={pending}
        startTransition={startTransition}
      />
    </div>
  );
}

function ExceptionsBlock({
  specialistId,
  exceptions,
  pending,
  startTransition,
}: {
  specialistId: string;
  exceptions: Exception[];
  pending: boolean;
  startTransition: React.TransitionStartFunction;
}) {
  const [date, setDate] = useState("");
  const [working, setWorking] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("16:00");

  function add() {
    if (!date) {
      toast.error("Укажите дату");
      return;
    }
    startTransition(async () => {
      const r = await addException(specialistId, {
        date,
        is_working: working,
        start_time: working ? start : null,
        end_time: working ? end : null,
        break_start: null,
        break_end: null,
      });
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else {
        toast.success("Исключение добавлено");
        setDate("");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteException(specialistId, id);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
    });
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">
        Исключения по датам
      </h2>

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 p-3">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-40"
          />
          <select
            value={working ? "work" : "off"}
            onChange={(e) => setWorking(e.target.value === "work")}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="off">Выходной</option>
            <option value="work">Особые часы</option>
          </select>
          {working && (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2"
              />
              <span className="text-neutral-400">–</span>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="h-8 rounded-lg border border-input bg-transparent px-2"
              />
            </div>
          )}
          <Button size="sm" onClick={add} disabled={pending} className="ml-auto">
            <Plus /> Добавить
          </Button>
        </div>

        {exceptions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">
            Исключений нет. Шаблон недели действует на все даты.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {exceptions.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <span className="flex-1 text-neutral-800">{fmtDate(e.date)}</span>
                <span className="text-neutral-500">
                  {e.is_working
                    ? `Особые часы ${hm(e.start_time)}–${hm(e.end_time)}`
                    : "Выходной"}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => remove(e.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
