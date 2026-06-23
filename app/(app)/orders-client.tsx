"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  OrderRow,
  BookingStatus,
  STATUS,
  FILTER_ORDER,
  clientName,
  fmtDateTime,
  fmtPrice,
} from "@/lib/bookings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Filter = "all" | BookingStatus;

export default function OrdersClient({
  initialOrders,
}: {
  initialOrders: OrderRow[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<Filter>("all");

  // realtime: любое изменение броней — перезапрашиваем серверные данные
  useEffect(() => {
    const channel = supabase
      .channel("bookings-feed")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, router]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: initialOrders.length,
      new: 0,
      confirmed: 0,
      completed: 0,
      paid: 0,
      cancelled: 0,
      hold: 0,
      no_show: 0,
    };
    for (const o of initialOrders) c[o.status]++;
    return c;
  }, [initialOrders]);

  const visible = initialOrders.filter(
    (o) => filter === "all" || o.status === filter,
  );

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Заказы
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Записи клиентов. Обновляются в реальном времени.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-1">
        {(["all", ...FILTER_ORDER] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              filter === f
                ? "bg-neutral-900 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {f === "all" ? "Все" : STATUS[f].label}
            <span className="ml-1.5 opacity-60">{counts[f]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Заказов пока нет. Как только клиент запишется — запись появится здесь.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата / время</TableHead>
                <TableHead>Клиент</TableHead>
                <TableHead>Мастер</TableHead>
                <TableHead>Услуга</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Цена</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((o) => (
                <TableRow
                  key={o.id}
                  onClick={() => router.push(`/orders/${o.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium text-neutral-900">
                    {fmtDateTime(o.starts_at)}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {clientName(o.client)}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {o.specialist?.full_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-neutral-600">
                    {o.service?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS[o.status].className}>
                      {STATUS[o.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-neutral-600">
                    {fmtPrice(o.price_snapshot)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
