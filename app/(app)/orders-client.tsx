"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, LayoutList, LayoutGrid } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useShop } from "@/contexts/ShopContext";
import { CreateBookingModal } from "@/components/bookings/CreateBookingModal";
import { KanbanBoard } from "@/components/bookings/KanbanBoard";
import { TimeFilter } from "@/components/bookings/TimeFilter";
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
type ViewMode = "table" | "kanban";

export default function OrdersClient({
  initialOrders,
  shopId,
  onStatusChange,
}: {
  initialOrders: OrderRow[];
  shopId: number;
  onStatusChange: (bookingId: string, newStatus: BookingStatus) => Promise<void>;
}) {
  const { formatPrice } = useShop();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState<Filter>("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const mode = searchParams.get("view") as ViewMode;
    return mode === "kanban" ? "kanban" : "table";
  });
  
  const [timeFilter, setTimeFilter] = useState<"today" | "week" | "month" | "year" | "all">("all");

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    const params = new URLSearchParams(searchParams.toString());
    if (mode === "kanban") {
      params.set("view", "kanban");
    } else {
      params.delete("view");
    }
    router.push(`?${params.toString()}`, { scroll: false });
  };

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

  const filteredByTime = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    return initialOrders.filter((o) => {
      const date = new Date(o.starts_at);
      switch (timeFilter) {
        case "today": return date >= today;
        case "week": return date >= weekStart;
        case "month": return date >= monthStart;
        case "year": return date >= yearStart;
        case "all":
        default: return true;
      }
    });
  }, [initialOrders, timeFilter]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: filteredByTime.length,
      new: 0,
      confirmed: 0,
      completed: 0,
      paid: 0,
      cancelled: 0,
      hold: 0,
      no_show: 0,
    };
    for (const o of filteredByTime) c[o.status]++;
    return c;
  }, [filteredByTime]);

  const visible = filteredByTime.filter(
    (o) => filter === "all" || o.status === filter,
  );

  const timeCounts = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    return {
      today: initialOrders.filter((o) => new Date(o.starts_at) >= today).length,
      week: initialOrders.filter((o) => new Date(o.starts_at) >= weekStart).length,
      month: initialOrders.filter((o) => new Date(o.starts_at) >= monthStart).length,
      year: initialOrders.filter((o) => new Date(o.starts_at) >= yearStart).length,
      all: initialOrders.length,
    };
  }, [initialOrders]);

  const handleBookingCreated = () => {
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-7xl px-8 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Записи
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {viewMode === "table"
              ? "Таблица записей. Обновляются в реальном времени."
              : "Перетаскивайте карточки между колонками для изменения статуса."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
            <button
              onClick={() => handleViewModeChange("table")}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                viewMode === "table"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
              title="Таблица"
            >
              <LayoutList className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleViewModeChange("kanban")}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                viewMode === "kanban"
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-500 hover:text-neutral-900"
              }`}
              title="Доска"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition"
          >
            <Plus className="h-4 w-4" />
            Создать запись
          </button>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <TimeFilter
          value={timeFilter}
          onChange={setTimeFilter}
          counts={timeCounts}
        />

        <div className="flex flex-wrap items-center gap-1 border-l border-neutral-200 pl-3">
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
      </div>

      {viewMode === "table" ? (
        <>
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
                      onClick={() => {
                        const params = new URLSearchParams(searchParams.toString());
                        params.set("from", viewMode);
                        router.push(`/orders/${o.id}?${params.toString()}`);
                      }}
                      className="cursor-pointer"
                    >
                      <TableCell className="font-medium text-neutral-900">
                        {fmtDateTime(o.starts_at)}
                        {(o.reschedule_count ?? 0) > 0 && o.orig_starts_at && (
                          <div
                            className="mt-0.5 text-xs font-normal text-amber-600"
                            title={`Изначально: ${fmtDateTime(o.orig_starts_at)}`}
                          >
                            🔄 перенесено
                            {(o.reschedule_count ?? 0) > 1 ? ` ×${o.reschedule_count}` : ""}
                            · было {fmtDateTime(o.orig_starts_at)}
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
        </>
      ) : (
        <div className="mt-4">
          <KanbanBoard
            initialBookings={visible}
            onStatusChange={onStatusChange}
            timeFilter={timeFilter}
          />
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