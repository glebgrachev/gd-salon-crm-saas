"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  PERIOD_TABS,
  type PeriodType,
  parseAnchor,
  toAnchorStr,
  shiftAnchor,
  computeRange,
} from "@/lib/analytics";

export default function PeriodPicker({
  type,
  date,
}: {
  type: PeriodType;
  date: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const anchor = parseAnchor(date);
  const { label } = computeRange(type, anchor);

  const go = (t: PeriodType, d: string) =>
    router.push(`${pathname}?type=${t}&date=${d}`);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-sm">
        {PERIOD_TABS.map((t) => (
          <button
            key={t.type}
            onClick={() => go(t.type, toAnchorStr(anchor))}
            className={`rounded-md px-3 py-1 transition ${
              type === t.type
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-1 py-0.5">
        <button
          onClick={() => go(type, toAnchorStr(shiftAnchor(type, anchor, -1)))}
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="min-w-36 text-center text-sm font-medium text-neutral-800">
          {label}
        </span>
        <button
          onClick={() => go(type, toAnchorStr(shiftAnchor(type, anchor, 1)))}
          className="flex size-7 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
