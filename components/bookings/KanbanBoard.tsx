"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Calendar, User, Scissors, ChevronRight } from "lucide-react";
import { toast } from "sonner";

// Типы
type BookingStatus = "new" | "confirmed" | "completed" | "cancelled" | "no_show";

type BookingRow = {
  id: string;
  starts_at: string;
  status: BookingStatus;
  service: { name: string } | null;
  specialist: { full_name: string } | null;
  client: { first_name: string | null; last_name: string | null } | null;
};

type Column = {
  id: BookingStatus;
  title: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
};

const COLUMNS: Record<BookingStatus, Column> = {
  new: {
    id: "new",
    title: "Новые",
    color: "text-amber-600",
    bgColor: "bg-amber-50 border-amber-200",
    icon: <Clock className="h-4 w-4" />,
  },
  confirmed: {
    id: "confirmed",
    title: "Подтверждены",
    color: "text-blue-600",
    bgColor: "bg-blue-50 border-blue-200",
    icon: <Calendar className="h-4 w-4" />,
  },
  completed: {
    id: "completed",
    title: "Выполнены",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 border-emerald-200",
    icon: <ChevronRight className="h-4 w-4" />,
  },
  cancelled: {
    id: "cancelled",
    title: "Отменены",
    color: "text-red-600",
    bgColor: "bg-red-50 border-red-200",
    icon: <User className="h-4 w-4" />,
  },
  no_show: {
    id: "no_show",
    title: "Не пришли",
    color: "text-neutral-500",
    bgColor: "bg-neutral-50 border-neutral-200",
    icon: <Scissors className="h-4 w-4" />,
  },
};

type KanbanBoardProps = {
  initialBookings: BookingRow[];
  onStatusChange: (bookingId: string, newStatus: BookingStatus) => Promise<void>;
  timeFilter: "today" | "week" | "month" | "year" | "all";
};

// Компонент карточки записи
function BookingCard({ booking, isDragOverlay }: { booking: BookingRow; isDragOverlay?: boolean }) {
  const clientName = [booking.client?.first_name, booking.client?.last_name]
    .filter(Boolean)
    .join(" ") || "Без имени";

  return (
    <div
      className={`
        rounded-lg border border-neutral-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow
        ${isDragOverlay ? "shadow-2xl scale-105 rotate-1" : ""}
      `}
    >
      <div className="font-medium text-sm text-neutral-900 truncate">
        {booking.service?.name || "Услуга"}
      </div>
      <div className="text-xs text-neutral-500 mt-1">
        {clientName}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-neutral-400">
        <span>
          {new Date(booking.starts_at).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {booking.specialist?.full_name && (
          <span className="truncate max-w-[80px]">
            {booking.specialist.full_name}
          </span>
        )}
      </div>
    </div>
  );
}

// Компонент карточки с поддержкой drag-and-drop
function SortableBookingCard({
  booking,
  columnId,
}: {
  booking: BookingRow;
  columnId: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: booking.id,
    data: {
      type: "booking",
      booking,
      columnId,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BookingCard booking={booking} />
    </div>
  );
}

// Компонент колонки
function Column({
  id,
  bookings,
  count,
}: {
  id: BookingStatus;
  bookings: BookingRow[];
  count: number;
}) {
  const column = COLUMNS[id];
  const { setNodeRef } = useSortable({
    id: `column-${id}`,
    data: { type: "column", columnId: id },
  });

  return (
    <div ref={setNodeRef} className="flex-1 min-w-[200px]">
      <div className={`rounded-lg border ${column.bgColor} p-3`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={column.color}>{column.icon}</span>
            <span className={`text-sm font-medium ${column.color}`}>
              {column.title}
            </span>
          </div>
          <span className="text-xs text-neutral-400 bg-white px-2 py-0.5 rounded-full">
            {count}
          </span>
        </div>

        <div className="space-y-2 min-h-[120px]">
          <SortableContext items={bookings.map(b => b.id)} strategy={verticalListSortingStrategy}>
            {bookings.map((booking) => (
              <SortableBookingCard
                key={booking.id}
                booking={booking}
                columnId={id}
              />
            ))}
          </SortableContext>
          {bookings.length === 0 && (
            <div className="text-xs text-neutral-400 text-center py-4 border border-dashed border-neutral-200 rounded-lg">
              Нет записей
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Основной компонент
export function KanbanBoard({ initialBookings, onStatusChange, timeFilter }: KanbanBoardProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState(initialBookings);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  // Группируем записи по статусам
  const groupedBookings = bookings.reduce((acc, booking) => {
    const status = booking.status;
    if (!acc[status]) acc[status] = [];
    acc[status].push(booking);
    return acc;
  }, {} as Record<BookingStatus, BookingRow[]>);

  // Все колонки с порядком
  const columnOrder: BookingStatus[] = ["new", "confirmed", "completed", "cancelled", "no_show"];

  const handleDragStart = (event: any) => {
    const { active } = event;
    setActiveId(active.id);
    const booking = bookings.find((b) => b.id === active.id);
    setActiveBooking(booking || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    setActiveId(null);
    setActiveBooking(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Определяем, куда перетащили
    const overBooking = bookings.find((b) => b.id === overId);
    const overColumn = columnOrder.find((c) => `column-${c}` === overId);

    if (!overBooking && !overColumn) return;

    let newStatus: BookingStatus | null = null;

    if (overColumn) {
      // Перетащили в колонку (на заголовок или пустое место)
      newStatus = overColumn;
    } else if (overBooking) {
      // Перетащили на другую карточку — берём статус карточки
      newStatus = overBooking.status;
    }

    if (!newStatus) return;

    const booking = bookings.find((b) => b.id === activeId);
    if (!booking) return;

    // Если статус не изменился — ничего не делаем
    if (booking.status === newStatus) return;

    // Оптимистично обновляем UI
    const updatedBookings = bookings.map((b) =>
      b.id === activeId ? { ...b, status: newStatus! } : b
    );
    setBookings(updatedBookings);

    try {
      await onStatusChange(activeId, newStatus);
      toast.success(`Запись перемещена в "${COLUMNS[newStatus].title}"`);
      router.refresh();
    } catch (error) {
      // Откатываем при ошибке
      setBookings(bookings);
      toast.error("Не удалось изменить статус");
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-5 gap-4">
        {columnOrder.map((status) => (
          <Column
            key={status}
            id={status}
            bookings={groupedBookings[status] || []}
            count={groupedBookings[status]?.length || 0}
          />
        ))}
      </div>

      <DragOverlay
        dropAnimation={{
          sideEffects: defaultDropAnimationSideEffects({
            styles: {
              active: {
                opacity: "0.4",
              },
            },
          }),
        }}
      >
        {activeBooking && (
          <div className="opacity-100">
            <BookingCard booking={activeBooking} isDragOverlay />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}