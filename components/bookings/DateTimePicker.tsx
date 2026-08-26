"use client";

import { useState, useEffect } from "react";

type Slot = {
  slot_start: string;
  slot_end: string;
  is_free: boolean;
};

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  specialistId?: string;
  serviceId?: string;
  shopId?: number;
};

// Функция для генерации следующих дней (как в приложении)
function nextDays(n = 21) {
  const out: { dateStr: string; dow: string; dom: number }[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    out.push({
      dateStr: `${y}-${m}-${day}`,
      dow: new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(d),
      dom: d.getDate(),
    });
  }
  return out;
}

// Форматирование времени (как в приложении)
function slotTime(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(new Date(iso));
}

export function DateTimePicker({ 
  value, 
  onChange, 
  error,
  specialistId,
  serviceId,
  shopId
}: DateTimePickerProps) {
  const days = nextDays();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    if (value) {
      const datePart = value.split('T')[0];
      return datePart;
    }
    return days[0]?.dateStr || "";
  });

  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(() => {
    if (value) {
      return value;
    }
    return null;
  });

  // Загружаем слоты при изменении даты, мастера или услуги
  useEffect(() => {
    if (specialistId && serviceId && shopId && selectedDate) {
      loadSlots();
    } else {
      setSlots([]);
    }
  }, [selectedDate, specialistId, serviceId, shopId]);

  const loadSlots = async () => {
    if (!specialistId || !serviceId || !shopId || !selectedDate) return;
    
    setSlotsLoading(true);
    try {
      const params = new URLSearchParams({
        shopId: String(shopId),
        specialist: specialistId,
        service: serviceId,
        date: selectedDate,
      });

      const res = await fetch(`/api/admin/day-slots?${params.toString()}`);
      const result = await res.json();
      
      if (result.ok) {
        setSlots(result.slots || []);
      } else {
        setSlots([]);
      }
    } catch (error) {
      console.error("Ошибка загрузки слотов:", error);
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // При выборе слота — обновляем значение (передаём как есть)
  const handleSlotSelect = (slotStart: string) => {
    setSelectedSlot(slotStart);
    onChange(slotStart);
  };

  const freeSlots = slots.filter(s => s.is_free);

  return (
    <div className="space-y-3">
      {/* Дата — горизонтальный скролл как в приложении */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1.5">
          Дата <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-neutral-300">
          {days.map((d) => (
            <button
              key={d.dateStr}
              onClick={() => {
                setSelectedDate(d.dateStr);
                setSelectedSlot(null);
                onChange("");
              }}
              className={`flex min-w-[52px] flex-col items-center rounded-lg border px-2 py-1.5 text-sm transition ${
                selectedDate === d.dateStr
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400"
              }`}
              type="button"
            >
              <span className="text-[10px] uppercase">{d.dow}</span>
              <span className="font-medium">{d.dom}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Время — сетка слотов как в приложении */}
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1.5">
          Время <span className="text-red-500">*</span>
        </label>
        
        {!specialistId || !serviceId ? (
          <p className="text-sm text-neutral-400">
            Сначала выберите услугу и мастера
          </p>
        ) : slotsLoading ? (
          <div className="grid grid-cols-4 gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-neutral-100 animate-pulse" />
            ))}
          </div>
        ) : freeSlots.length === 0 ? (
          <p className="text-sm text-amber-600">
            На этот день нет свободных слотов. Выберите другую дату.
          </p>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {freeSlots.map((s) => (
              <button
                key={s.slot_start}
                onClick={() => handleSlotSelect(s.slot_start)}
                className={`rounded-lg border px-3 py-2 text-sm transition ${
                  selectedSlot === s.slot_start
                    ? "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 hover:bg-neutral-50"
                }`}
                type="button"
              >
                {slotTime(s.slot_start)}
              </button>
            ))}
          </div>
        )}
        
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
        <p className="mt-0.5 text-[10px] text-neutral-400">
          Показаны только свободные слоты
        </p>
      </div>
    </div>
  );
}