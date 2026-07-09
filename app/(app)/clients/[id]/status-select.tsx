"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { STATUS, STATUS_FLOW, type BookingStatus } from "@/lib/bookings";
import { updateBookingStatus } from "../../orders/[id]/actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function StatusSelect({
  bookingId,
  status: initial,
}: {
  bookingId: string;
  status: BookingStatus;
}) {
  const [status, setStatus] = useState<BookingStatus>(initial);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onChange(next: BookingStatus) {
    const prev = status;
    setStatus(next);
    startTransition(async () => {
      const r = await updateBookingStatus(bookingId, next);
      if (!r.ok) {
        setStatus(prev);
        toast.error(r.error ?? "Не удалось изменить статус");
      } else {
        toast.success("Статус обновлён: " + STATUS[next].label);
        router.refresh();
      }
    });
  }

  return (
    <Select value={status} onValueChange={(v) => onChange(v as BookingStatus)} disabled={pending}>
      <SelectTrigger className={`h-7 w-40 border text-xs font-medium ${STATUS[status].className}`}>
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
  );
}
