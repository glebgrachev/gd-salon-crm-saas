"use client";

import Link from "next/link";
import { ArrowLeft, Star } from "lucide-react";

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

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

export default function ScheduleEditor({
  specialist,
  children,
}: {
  specialist: {
    id: string;
    full_name: string;
    photo_url: string | null;
    experience_years: number;
    rating: number | null;
  };
  schedules?: Schedule[];
  exceptions?: Exception[];
  children?: React.ReactNode;
}) {
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
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-200 text-lg font-semibold text-neutral-600">
            {initials(specialist.full_name)}
          </div>
        )}
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
            {specialist.full_name}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Star size={13} className="fill-amber-400 text-amber-400" />
              {specialist.rating?.toFixed(1) ?? "0.0"}
            </span>
            <span>· {specialist.experience_years} лет опыта</span>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-6">{children}</div>
    </div>
  );
}
