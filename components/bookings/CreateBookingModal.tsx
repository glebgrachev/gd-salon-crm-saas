"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { BookingForm } from "./BookingForm";

type CreateBookingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  shopId: number;
};

export function CreateBookingModal({
  isOpen,
  onClose,
  onSuccess,
  shopId,
}: CreateBookingModalProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (data: {
    clientId: number;
    serviceId: string;
    specialistId: string;
    startsAt: string;
  }) => {
    setIsLoading(true);

    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          shopId,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        onSuccess();
        onClose();
      } else {
        alert(result.error || "Не удалось создать запись");
      }
    } catch (error) {
      alert("Ошибка при создании записи");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Создать запись
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-neutral-100"
          >
            <X className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        <BookingForm
          shopId={shopId}
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}