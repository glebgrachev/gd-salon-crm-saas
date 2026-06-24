import Link from "next/link";
import { fmtPrice } from "@/lib/bookings";
import { fmtCompact } from "@/lib/analytics";

export type Slice = { label: string; value: number; color: string };

export function Donut({
  items,
  centerLabel,
}: {
  items: Slice[];
  centerLabel?: string;
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const r = 60;
  const C = 2 * Math.PI * r;
  const gap = total > 0 ? Math.min(6, C * 0.01) : 0;
  let acc = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 160 160" className="size-40 shrink-0">
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          stroke="var(--color-muted, #f5f5f5)"
          strokeWidth="18"
        />
        <g transform="rotate(-90 80 80)">
          {total > 0 &&
            items.map((it, i) => {
              const len = (it.value / total) * C;
              const seg = Math.max(0, len - gap);
              const node = (
                <circle
                  key={i}
                  cx="80"
                  cy="80"
                  r={r}
                  fill="none"
                  stroke={it.color}
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeDasharray={`${seg} ${C - seg}`}
                  strokeDashoffset={-acc}
                />
              );
              acc += len;
              return node;
            })}
        </g>
        <text
          x="80"
          y="74"
          textAnchor="middle"
          className="fill-neutral-400"
          style={{ fontSize: 11 }}
        >
          Выручка
        </text>
        <text
          x="80"
          y="92"
          textAnchor="middle"
          className="fill-neutral-900"
          style={{ fontSize: 16, fontWeight: 600 }}
        >
          {centerLabel ?? fmtCompact(total)}
        </text>
      </svg>

      <ul className="min-w-0 flex-1 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: it.color }}
            />
            <span className="min-w-0 flex-1 truncate text-neutral-600">
              {it.label}
            </span>
            <span className="shrink-0 font-medium text-neutral-900">
              {fmtPrice(it.value)}
            </span>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-neutral-400">Нет данных</li>
        )}
      </ul>
    </div>
  );
}

export type BarItem = {
  label: string;
  value: number;
  valueLabel?: string;
  meta?: string;
  color: string;
  href?: string;
};

export function BarList({ items, max }: { items: BarItem[]; max: number }) {
  return (
    <ul className="space-y-3">
      {items.map((it, i) => {
        const pct = max > 0 ? Math.round((it.value / max) * 100) : 0;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate text-neutral-700">
                {it.label}
              </span>
              <span className="shrink-0 font-medium text-neutral-900">
                {it.valueLabel ?? fmtPrice(it.value)}
                {it.meta && (
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    {it.meta}
                  </span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${it.color}99, ${it.color})`,
                }}
              />
            </div>
          </>
        );
        return it.href ? (
          <li key={i}>
            <Link
              href={it.href}
              className="block rounded-lg p-1 transition hover:bg-neutral-50"
            >
              {body}
            </Link>
          </li>
        ) : (
          <li key={i}>{body}</li>
        );
      })}
      {items.length === 0 && (
        <li className="text-sm text-neutral-400">Нет данных</li>
      )}
    </ul>
  );
}

export function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      {children}
    </div>
  );
}

export function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white p-4">
      {accent && (
        <span
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: accent }}
        />
      )}
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}
