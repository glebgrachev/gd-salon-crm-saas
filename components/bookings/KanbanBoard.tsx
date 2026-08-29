"use client";

import { useState, useEffect } from "react";
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
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  Clock, 
  Calendar, 
  User, 
  Scissors, 
  CheckCircle, 
  XCircle, 
  CreditCard,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

type BookingStatus = "new" | "confirmed" | "paid" | "completed" | "cancelled" | "hold";

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
  icon: React.ReactNode;
};

const COLUMNS: Record<BookingStatus, Column> = {
  new: {
    id: "new",
    title: "Новые",
    color: "text-amber-600",
    icon: <Clock className="h-4 w-4" />,
  },
  confirmed: {
    id: "confirmed",
    title: "Подтверждены",
    color: "text-blue-600",
    icon: <Calendar className="h-4 w-4" />,
  },
  paid: {
    id: "paid",
    title: "Оплачены",
    color: "text-emerald-600",
    icon: <CreditCard className="h-4 w-4" />,
  },
  completed: {
    id: "completed",
    title: "Завершены",
    color: "text-neutral-600",
    icon: <CheckCircle className="h-4 w-4" />,
  },
  cancelled: {
    id: "cancelled",
    title: "Отменены",
    color: "text-red-600",
    icon: <XCircle className="h-4 w-4" />,
  },
  hold: {
    id: "hold",
    title: "На удержании",
    color: "text-orange-600",
    icon: <AlertCircle className="h-4 w-4" />,
  },
};

const COLUMN_ORDER: BookingStatus[] = ["new", "confirmed", "paid", "completed", "cancelled", "hold"];

// Цвета для вертикальных полосок
const STATUS_BAR_COLORS: Record<BookingStatus, string> = {
  new: "bg-amber-400",
  confirmed: "bg-blue-400",
  paid: "bg-emerald-400",
  completed: "bg-neutral-400",
  cancelled: "bg-red-400",
  hold: "bg-orange-400",
};

type KanbanBoardProps = {
  initialBookings: BookingRow[];
  onStatusChange: (bookingId: string, newStatus: BookingStatus) => Promise<void>;
  timeFilter: "today" | "week" | "month" | "year" | "all";
};

// Компонент карточки записи с вертикальной полоской
function BookingCard({ booking, isDragOverlay }: { booking: BookingRow; isDragOverlay?: boolean }) {
  const clientName = [booking.client?.first_name, booking.client?.last_name]
    .filter(Boolean)
    .join(" ") || "Без имени";

  const statusColumn = COLUMNS[booking.status];
  const barColor = STATUS_BAR_COLORS[booking.status] || "bg-neutral-300";

  return (
    <div
      className={`
        relative rounded-lg border border-neutral-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow overflow-hidden
        ${isDragOverlay ? "shadow-2xl scale-105 rotate-1" : ""}
      `}
    >
      {/* Вертикальная цветная полоска */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${barColor}`} />
      
      <div className="pl-3">
        <div className="flex items-start justify-between gap-2">
          <div className="font-medium text-sm text-neutral-900 truncate flex-1">
            {booking.service?.name || "Услуга"}
          </div>
          <span className={`text-[10px] font-medium ${statusColumn?.color || "text-neutral-400"}`}>
            {statusColumn?.title || booking.status}
          </span>
        </div>
        <div className="text-xs text-neutral-500 mt-1 truncate">
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
    </div>
  );
}

// Компонент карточки с поддержкой drag-and-drop
function SortableBookingCard({
  booking,
}: {
  booking: BookingRow;
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

// Компонент колонки — без цветной подложки, только заголовок и светлый фон
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

  return (
    <div className="flex-1 min-w-[200px]">
      {/* Заголовок колонки */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <span className={column.color}>{column.icon}</span>
          <span className={`text-sm font-medium ${column.color}`}>
            {column.title}
          </span>
        </div>
        <span className="text-xs text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>

      {/* Список карточек на светлом фоне */}
      <div className="rounded-lg bg-neutral-50/80 p-3 min-h-[120px]">
        <SortableContext items={bookings.map(b => b.id)} strategy={verticalListSortingStrategy}>
          {bookings.map((booking) => (
            <SortableBookingCard
              key={booking.id}
              booking={booking}
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
  );
}

// Основной компонент
export function KanbanBoard({ initialBookings, onStatusChange }: KanbanBoardProps) {
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
    const status = booking.status as BookingStatus;
    if (!acc[status]) acc[status] = [];
    acc[status].push(booking);
    return acc;
  }, {} as Record<BookingStatus, BookingRow[]>);

  // Убеждаемся, что все колонки присутствуют
  const allColumns = COLUMN_ORDER.reduce((acc, status) => {
    acc[status] = groupedBookings[status] || [];
    return acc;
  }, {} as Record<BookingStatus, BookingRow[]>);

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
    const overColumn = COLUMN_ORDER.find((c) => `column-${c}` === overId);

    if (!overBooking && !overColumn) return;

    let newStatus: BookingStatus | null = null;

    if (overColumn) {
      newStatus = overColumn;
    } else if (overBooking) {
      newStatus = overBooking.status;
    }

    if (!newStatus) return;

    const booking = bookings.find((b) => b.id === activeId);
    if (!booking) return;

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
      <div className="grid grid-cols-6 gap-4">
        {COLUMN_ORDER.map((status) => (
          <Column
            key={status}
            id={status}
            bookings={allColumns[status] || []}
            count={allColumns[status]?.length || 0}
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