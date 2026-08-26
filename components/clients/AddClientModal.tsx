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

  const handleSubmit = async (data: { firstName: string; lastName: string; phone: string }) => {
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/admin/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          shopId,
        }),
      });

      const result = await response.json();
      
      if (result.ok) {
        onSuccess(result.clientId);
        onClose();
      } else {
        alert(result.error || "Не удалось создать клиента");
      }
    } catch (error) {
      alert("Ошибка при создании клиента");
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
            Добавить клиента
          </h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-neutral-100"
          >
            <X className="h-5 w-5 text-neutral-500" />
          </button>
        </div>

        <ClientForm
          onSubmit={handleSubmit}
          isLoading={isLoading}
          submitLabel="Добавить клиента"
        />
      </div>
    </div>
  );
}