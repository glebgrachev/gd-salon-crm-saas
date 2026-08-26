"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useShop } from "@/contexts/ShopContext";
import { CreateBookingModal } from "@/components/bookings/CreateBookingModal";
import {
  OrderRow,
  BookingStatus,
  STATUS,
  FILTER_ORDER,
  clientName,
  fmtDateTime,
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
  shopId,
}: {
  initialOrders: OrderRow[];
  shopId: number;
}) {
  const { formatPrice } = useShop();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

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

  const handleBookingCreated = () => {
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Записи
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Записи клиентов. Обновляются в реальном времени.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition"
        >
          <Plus className="h-4 w-4" />
          Создать запись
        </button>
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
          Записей пока нет. Как только клиент запишется — запись появится здесь.
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
                    {(o.reschedule_count ?? 0) > 0 && o.orig_starts_at && (
                      <div
                        className="mt-0.5 text-xs font-normal text-amber-600"
                        title={`Изначально: ${fmtDateTime(o.orig_starts_at)}`}
                      >
                        🔄 перенесено{(o.reschedule_count ?? 0) > 1 ? ` ×${o.reschedule_count}` : ""} · было{" "}
                        {fmtDateTime(o.orig_starts_at)}
                      </div>
                    )}
                    {o.rescheduled_to && (
                      <div className="mt-0.5 text-xs font-normal text-neutral-400">
                        отменено при переносе
                      </div>
                    )}
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
                    {formatPrice(o.price_snapshot)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CreateBookingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleBookingCreated}
        shopId={shopId}
      />
    </div>
  );
}