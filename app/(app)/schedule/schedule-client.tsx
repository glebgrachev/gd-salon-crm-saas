"use client";

import { useState } from "react";
import ScheduleCalendar from "@/components/schedule-calendar";

export type SpecOption = { id: string; full_name: string; photo_url: string | null };

export default function ScheduleClient({ specialists }: { specialists: SpecOption[] }) {
  const [specId, setSpecId] = useState(specialists[0]?.id ?? "");

  if (specialists.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="text-lg font-semibold text-neutral-900">График работы</h1>
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Сначала добавьте мастеров.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">График работы</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Выберите мастера и разметьте месяц. Смена мастера сбрасывает несохранённые изменения.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {specialists.map((s) => (
          <button
            key={s.id}
            onClick={() => setSpecId(s.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              specId === s.id
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {s.full_name}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {specId && (
          <ScheduleCalendar
            key={specId}
            specialistId={specId}
            title="Месяц"
            subtitle="Клик по дню переключает: не задан → рабочий → выходной."
          />
        )}
      </div>
    </div>
  );
}
