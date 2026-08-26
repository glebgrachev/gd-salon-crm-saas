"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { ClientForm } from "./ClientForm";

type AddClientModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (clientId: number) => void;
  shopId: number;
};

export function AddClientModal({ 
  isOpen, 
  onClose, 
  onSuccess, 
  shopId 
}: AddClientModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const handleSubmit = async (data: { firstName: string; lastName: string; phone: string }) => {
    setIsLoading(true);
    setDuplicateError(null);
    
    try {
      console.log('📤 Отправка запроса на создание клиента:', data);
      
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          shopId,
        }),
      });

      console.log('📥 Ответ от сервера:', {
        status: response.status,
        statusText: response.statusText,
      });

      const result = await response.json();
      console.log('📦 Тело ответа:', result);
      
      // ⚠️ Проверяем на дубликат по статусу или по полю error
      if (response.status === 409 || result.error === "duplicate") {
        setDuplicateError(result.message || `Клиент с номером ${data.phone} уже существует`);
        setIsLoading(false);
        return; // ❌ НЕ закрываем модалку
      }
      
      if (result.ok) {
        // ✅ Успешно создан
        onSuccess(result.clientId);
        onClose();
      } else {
        alert(result.error || "Не удалось создать клиента");
      }
    } catch (error) {
      console.error('❌ Ошибка при создании клиента:', error);
      alert("Ошибка при создании клиента");
    } finally {
      setIsLoading(false);
    }
  };

  // Сбрасываем ошибку при открытии/закрытии
  const handleClose = () => {
    setDuplicateError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
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

        {duplicateError && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-200">
            {duplicateError}
          </div>
        )}

        <ClientForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          submitLabel="Добавить клиента"
          key={duplicateError ? 'with-error' : 'normal'} // 👈 Принудительно обновляем форму
        />
      </div>
    </div>
  );
}