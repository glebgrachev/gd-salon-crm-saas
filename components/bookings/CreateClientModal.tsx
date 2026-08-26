"use client";

import { useState } from "react";
import { X, CheckCircle } from "lucide-react";
import { ClientForm } from "@/components/clients/ClientForm";

type CreateClientModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (clientId: number) => void;
  shopId: number;
};

export function CreateClientModal({
  isOpen,
  onClose,
  onSuccess,
  shopId,
}: CreateClientModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (data: { firstName: string; lastName: string; phone: string }) => {
    console.log('🔍 CreateClientModal: создание клиента', { data, shopId });
    setIsLoading(true);
    setDuplicateError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          shopId,
        }),
      });

      console.log('🔍 CreateClientModal: статус ответа', response.status);
      const result = await response.json();
      console.log('🔍 CreateClientModal: результат', result);

      if (response.status === 409 && result.error === "duplicate") {
        setDuplicateError(`Клиент с номером ${data.phone} уже существует`);
        setIsLoading(false);
        return;
      }

      if (result.ok) {
        console.log('✅ CreateClientModal: клиент создан, clientId =', result.clientId);
        setSuccessMessage(`✅ Клиент "${data.firstName} ${data.lastName}" успешно создан!`);
        setIsLoading(false);

        setTimeout(() => {
          onSuccess(result.clientId);
          onClose();
        }, 1000);
      } else {
        console.error('❌ CreateClientModal: ошибка создания', result.error);
        alert(result.error || "Не удалось создать клиента");
        setIsLoading(false);
      }
    } catch (error) {
      console.error('❌ CreateClientModal: исключение', error);
      alert("Ошибка при создании клиента");
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    console.log('🔍 CreateClientModal: закрытие');
    setDuplicateError(null);
    setSuccessMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div 
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">
            Добавить клиента
          </h2>
          <button
            onClick={handleClose}
            className="rounded-full p-1 hover:bg-neutral-100"
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

        {duplicateError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            {duplicateError}
          </div>
        )}

        <ClientForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          submitLabel="Добавить клиента"
          key={duplicateError ? 'with-error' : 'normal'}
        />
      </div>
    </div>
  );
}