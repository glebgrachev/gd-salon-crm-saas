export type PeriodType = "week" | "month" | "quarter" | "year";

export const PERIOD_TABS: { type: PeriodType; label: string }[] = [
  { type: "week", label: "Неделя" },
  { type: "month", label: "Месяц" },
  { type: "quarter", label: "Квартал" },
  { type: "year", label: "Год" },
];

export const PALETTE = [
  "#8b5cf6",
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#6366f1",
  "#f97316",
  "#14b8a6",
  "#ec4899",
  "#84cc16",
  "#d946ef",
];

export function colorAt(i: number) {
  return PALETTE[i % PALETTE.length];
}

export function parseAnchor(s?: string): Date {
  if (s && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  }
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

export function toAnchorStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const day = (d.getUTCDay() + 6) % 7; // 0 = Пн
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() - day);
  return r;
}

const fmtD = (d: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(d);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function computeRange(type: PeriodType, anchor: Date) {
  const y = anchor.getUTCFullYear();
  let from: Date;
  let to: Date;
  let label: string;

  if (type === "week") {
    from = startOfWeek(anchor);
    to = new Date(from);
    to.setUTCDate(from.getUTCDate() + 7);
    const end = new Date(to);
    end.setUTCDate(to.getUTCDate() - 1);
    label = `${fmtD(from)} – ${fmtD(end)} ${from.getUTCFullYear()}`;
  } else if (type === "month") {
    from = new Date(Date.UTC(y, anchor.getUTCMonth(), 1));
    to = new Date(Date.UTC(y, anchor.getUTCMonth() + 1, 1));
    label = cap(
      new Intl.DateTimeFormat("ru-RU", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(from),
    );
  } else if (type === "quarter") {
    const q = Math.floor(anchor.getUTCMonth() / 3);
    from = new Date(Date.UTC(y, q * 3, 1));
    to = new Date(Date.UTC(y, q * 3 + 3, 1));
    label = `${["I", "II", "III", "IV"][q]} квартал ${y}`;
  } else {
    from = new Date(Date.UTC(y, 0, 1));
    to = new Date(Date.UTC(y + 1, 0, 1));
    label = String(y);
  }

  return { fromISO: from.toISOString(), toISO: to.toISOString(), label };
}

export function shiftAnchor(type: PeriodType, anchor: Date, dir: 1 | -1): Date {
  const d = new Date(anchor);
  if (type === "week") d.setUTCDate(d.getUTCDate() + 7 * dir);
  else if (type === "month") d.setUTCMonth(d.getUTCMonth() + dir);
  else if (type === "quarter") d.setUTCMonth(d.getUTCMonth() + 3 * dir);
  else d.setUTCFullYear(d.getUTCFullYear() + dir);
  return d;
}

export function fmtCompact(n: number): string {
  return (
    new Intl.NumberFormat("ru-RU", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n) + " ₽"
  );
}
