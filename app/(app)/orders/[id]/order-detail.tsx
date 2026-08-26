"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Phone, Clock, Scissors, User } from "lucide-react";
import { toast } from "sonner";
import { useShop } from "@/contexts/ShopContext";
import {
  OrderRow,
  BookingStatus,
  STATUS,
  STATUS_FLOW,
  clientName,
  fmtDay,
  fmtTime,
  fmtDateTime,
} from "@/lib/bookings";
import { updateBookingStatus } from "./actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export default function OrderDetail({ order }: { order: OrderRow }) {
  const { formatPrice, currency } = useShop();
  const [status, setStatus] = useState<BookingStatus>(order.status);
  const [pending, startTransition] = useTransition();

  function onStatusChange(next: BookingStatus) {
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const r = await updateBookingStatus(order.id, next);
      if (!r.ok) {
        setStatus(prev);
        toast.error(r.error ?? "Не удалось изменить статус");
      } else {
        toast.success("Статус обновлён: " + STATUS[next].label);
      }
    });
  }

  const c = order.client;
  
  // ✅ Ссылка на Telegram только для реальных пользователей (не гостей)
  const tg = !c?.is_guest && c?.username
    ? `https://t.me/${c.username}`
    : !c?.is_guest && c
      ? `tg://user?id=${c.telegram_id}`
      : null;

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft size={15} /> Все заказы
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
            {order.service?.name ?? "Услуга"}
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Создан {fmtDateTime(order.created_at)}
          </p>
        </div>
        <Select
          value={status}
          onValueChange={(v) => onStatusChange(v as BookingStatus)}
          disabled={pending}
        >
          <SelectTrigger className={`w-44 border font-medium ${STATUS[status].className}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FLOW.map((s) => (
              <SelectItem key={s} value={s}>
                <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium ${STATUS[s].className}`}>
                  {STATUS[s].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 space-y-3">
        <Row icon={<Clock size={16} />} label="Когда">
          <span className="font-medium text-neutral-900">
            {fmtDay(order.starts_at)}
          </span>
          <span className="ml-2 text-neutral-600">
            {fmtTime(order.starts_at)}–{fmtTime(order.ends_at)}
          </span>
        </Row>

        <Row icon={<Scissors size={16} />} label="Мастер">
          {order.specialist?.full_name ?? "—"}
        </Row>

        <Row icon={<User size={16} />} label="Клиент">
          <span className="text-neutral-900">{clientName(c)}</span>
          {c?.username && !c?.is_guest && (
            <span className="ml-2 text-neutral-400">@{c.username}</span>
          )}
        </Row>

        {c?.phone && (
          <Row icon={<Phone size={16} />} label="Телефон">
            {c.phone}
          </Row>
        )}

        <div className="flex items-center justify-between border-t border-neutral-200 pt-4">
          <span className="text-sm text-neutral-500">Стоимость</span>
          <span className="text-base font-semibold text-neutral-900">
            {formatPrice(order.price_snapshot)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Badge variant="outline" className={STATUS[status].className}>
            {STATUS[status].label}
          </Badge>
          {order.client_confirmed_at ? (
            <span className="text-xs text-emerald-600">
              Клиент подтвердил приход
            </span>
          ) : (
            <span className="text-xs text-neutral-400">
              Подтверждение прихода не получено
            </span>
          )}
          {/* ✅ Кнопка Telegram только для реальных пользователей */}
          {tg && (
            <a
              href={tg}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-sm text-blue-600 hover:underline"
            >
              Написать в Telegram
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="text-neutral-400">{icon}</span>
      <span className="w-20 shrink-0 text-neutral-400">{label}</span>
      <span className="text-neutral-700">{children}</span>
    </div>
  );
}