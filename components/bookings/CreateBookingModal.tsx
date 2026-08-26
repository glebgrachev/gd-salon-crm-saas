"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle } from "lucide-react";
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
  const [mounted, setMounted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const handleSubmit = async (data: {
    clientId: number;
    serviceId: string;
    specialistId: string;
    startsAt: string;
    shopId: number;
  }) => {
    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: data.clientId,
          serviceId: data.serviceId,
          specialistId: data.specialistId,
          startsAt: data.startsAt,
          shopId: data.shopId,
        }),
      });

      const result = await response.json();

      if (result.ok) {
        setSuccessMessage("✅ Запись успешно создана!");
        setTimeout(() => {
          onSuccess();
          onClose();
          setSuccessMessage(null);
        }, 1500);
      } else {
        setErrorMessage(result.error || "Не удалось создать запись");
        setIsLoading(false);
      }
    } catch (error) {
      setErrorMessage("Ошибка при создании записи");
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setIsLoading(false);
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          handleClose();
        }
      }}
    >
      <div 
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Создать запись
          </h2>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-full p-1 hover:bg-neutral-100 transition disabled:opacity-50"
          >
            <X className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        {successMessage && (
          <div className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-600 border border-emerald-200 flex items-center gap-2">
            <CheckCircle className="h-4 w-4" />
            {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200 flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errorMessage}
          </div>
        )}

        <BookingForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
        />
      </div>
    </div>,
    document.body
  );
}