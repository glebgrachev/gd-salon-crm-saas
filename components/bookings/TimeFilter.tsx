"use client";

type TimeFilterValue = "today" | "week" | "month" | "year" | "all";

type TimeFilterProps = {
  value: TimeFilterValue;
  onChange: (filter: TimeFilterValue) => void;
  counts?: Record<TimeFilterValue, number>;
};

export function TimeFilter({ value, onChange, counts }: TimeFilterProps) {
  const filters: { id: TimeFilterValue; label: string }[] = [
    { id: "today", label: "Сегодня" },
    { id: "week", label: "Неделя" },
    { id: "month", label: "Месяц" },
    { id: "year", label: "Год" },
    { id: "all", label: "Все" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg bg-neutral-100 p-1">
      {filters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => onChange(filter.id)}
          className={`
            px-3 py-1.5 text-xs font-medium rounded-md transition
            ${
              value === filter.id
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-900"
            }
          `}
        >
          {filter.label}
          {counts && (
            <span className="ml-1.5 text-neutral-400 text-[10px]">
              {counts[filter.id] || 0}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}