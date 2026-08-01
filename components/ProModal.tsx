// components/ProModal.tsx
"use client";

import { useRouter } from "next/navigation";
import { Star, X } from "lucide-react";

interface ProModalProps {
  isOpen: boolean;
  onClose: () => void;
  moduleName: string;
  type?: "module" | "limit";  // Добавляем тип
  current?: number;           // Для лимитов
  limit?: number;             // Для лимитов
}

export default function ProModal({ 
  isOpen, 
  onClose, 
  moduleName,
  type = "module",
  current,
  limit 
}: ProModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const isLimit = type === "limit";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <Star className="h-6 w-6 fill-amber-200 text-amber-400" />
          </div>

          <h2 className="text-lg font-semibold text-neutral-900">
            {isLimit 
              ? `Достигнут лимит «${moduleName}»`
              : `Модуль «${moduleName}» не доступен на Вашем тарифе`
            }
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            {isLimit 
              ? `Вы используете ${current} из ${limit} ${moduleName}. 
                 Перейдите на тариф PRO, чтобы снять ограничения.`
              : `Этот модуль доступен только на тарифах PRO и выше.
                 Выберите подходящий тариф, чтобы открыть все возможности.`
            }
          </p>

          <div className="mt-6 flex w-full gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Позже
            </button>
            <button
              onClick={() => {
                onClose();
                router.push("/tariffs");
              }}
              className="flex-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
            >
              Выбрать тариф
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}