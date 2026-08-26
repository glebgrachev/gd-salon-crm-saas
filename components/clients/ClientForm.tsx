"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";

type ClientFormData = {
  firstName: string;
  lastName: string;
  phone: string;
};

type ClientFormProps = {
  initialData?: Partial<ClientFormData>;
  onSubmit: (data: ClientFormData) => void;
  isLoading?: boolean;
  submitLabel?: string;
};

export function ClientForm({ 
  initialData = {}, 
  onSubmit, 
  isLoading = false,
  submitLabel = "Добавить клиента"
}: ClientFormProps) {
  const [data, setData] = useState<ClientFormData>({
    firstName: initialData.firstName || "",
    lastName: initialData.lastName || "",
    phone: initialData.phone || "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ClientFormData, string>>>({});

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ClientFormData, string>> = {};
    
    if (!data.firstName.trim()) {
      newErrors.firstName = "Имя обязательно";
    }
    
    const phoneClean = data.phone.replace(/\D/g, '');
    if (phoneClean.length < 10) {
      newErrors.phone = "Введите корректный номер телефона";
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      onSubmit(data);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="firstName" className="block text-sm font-medium text-neutral-700">
          Имя <span className="text-red-500">*</span>
        </label>
        <Input
          id="firstName"
          value={data.firstName}
          onChange={(e) => setData({ ...data, firstName: e.target.value })}
          placeholder="Введите имя"
          className={errors.firstName ? "border-red-500" : ""}
        />
        {errors.firstName && (
          <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>
        )}
      </div>

      <div>
        <label htmlFor="lastName" className="block text-sm font-medium text-neutral-700">
          Фамилия
        </label>
        <Input
          id="lastName"
          value={data.lastName}
          onChange={(e) => setData({ ...data, lastName: e.target.value })}
          placeholder="Введите фамилию"
        />
      </div>

      <div>
        <label htmlFor="phone" className="block text-sm font-medium text-neutral-700">
          Телефон <span className="text-red-500">*</span>
        </label>
        <Input
          id="phone"
          value={data.phone}
          onChange={(e) => setData({ ...data, phone: e.target.value })}
          placeholder="+7 999 123-45-67"
          className={errors.phone ? "border-red-500" : ""}
        />
        {errors.phone && (
          <p className="mt-1 text-xs text-red-500">{errors.phone}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isLoading ? "Сохранение..." : submitLabel}
      </button>
    </form>
  );
}