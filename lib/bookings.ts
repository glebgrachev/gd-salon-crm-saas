export type BookingStatus =
  | "hold"
  | "new"
  | "confirmed"
  | "completed"
  | "paid"
  | "cancelled"
  | "no_show";

export type OrderRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  price_snapshot: number | null;
  client_confirmed_at: string | null;
  created_at: string;
  client: {
    telegram_id: number;
    first_name: string | null;
    last_name: string | null;
    username: string | null;
    phone: string | null;
  } | null;
  specialist: { id: string; full_name: string } | null;
  service: { id: string; name: string } | null;
};

export const STATUS: Record<
  BookingStatus,
  { label: string; className: string }
> = {
  hold: {
    label: "Холд",
    className: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
  new: {
    label: "Новый",
    className: "bg-blue-100 text-blue-700 border-blue-200",
  },
  confirmed: {
    label: "Подтверждено",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  completed: {
    label: "Завершено",
    className: "bg-violet-100 text-violet-700 border-violet-200",
  },
  paid: {
    label: "Оплачено",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  cancelled: {
    label: "Отменено",
    className: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
  no_show: {
    label: "Не пришёл",
    className: "bg-rose-100 text-rose-700 border-rose-200",
  },
};

// статусы, которые админ выставляет вручную в карточке заказа
export const STATUS_FLOW: BookingStatus[] = [
  "new",
  "confirmed",
  "completed",
  "paid",
  "cancelled",
];

// вкладки-фильтры в списке
export const FILTER_ORDER: BookingStatus[] = [
  "new",
  "confirmed",
  "completed",
  "paid",
  "cancelled",
];

export function clientName(c: OrderRow["client"]): string {
  if (!c) return "—";
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || (c.username ? "@" + c.username : "—");
}

export function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "short",
    day: "2-digit",
    month: "long",
  }).format(new Date(iso));
}

export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtPrice(v: number | null): string {
  if (v == null) return "—";
  return new Intl.NumberFormat("ru-RU").format(v) + " ₽";
}
