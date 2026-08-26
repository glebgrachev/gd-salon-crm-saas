"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { ClientSelect } from "./ClientSelect";

type Service = {
  id: string;
  name: string;
  duration_min: number;
};

type Specialist = {
  id: string;
  full_name: string;
};

type BookingFormData = {
  clientId: number | null;
  serviceId: string;
  specialistId: string;
  startsAt: string;
};

type BookingFormProps = {
  shopId: number;
  onSubmit: (data: BookingFormData) => void;
  isLoading?: boolean;
};

export function BookingForm({ shopId, onSubmit, isLoading }: BookingFormProps) {
  const [data, setData] = useState<BookingFormData>({
    clientId: null,
    serviceId: "",
    specialistId: "",
    startsAt: "",
  });

  const [services, setServices] = useState<Service[]>([]);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadServices();
    loadSpecialists();
  }, []);

  const loadServices = async () => {
    try {
      const res = await fetch(`/api/admin/services?shopId=${shopId}`);
      const data = await res.json();
      if (data.ok) {
        setServices(data.services);
      }
    } catch (error) {
      console.error("Ошибка загрузки услуг:", error);
    }
  };

  const loadSpecialists = async () => {
    try {
      const res = await fetch(`/api/admin/specialists?shopId=${shopId}`);
      const data = await res.json();
      if (data.ok) {
        setSpecialists(data.specialists);
      }
    } catch (error) {
      console.error("Ошибка загрузки мастеров:", error);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.clientId) newErrors.clientId = "Выберите клиента";
    if (!data.serviceId) newErrors.serviceId = "Выберите услугу";
    if (!data.specialistId) newErrors.specialistId = "Выберите мастера";
    if (!data.startsAt) newErrors.startsAt = "Выберите дату и время";
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
        <label className="block text-sm font-medium text-neutral-700">
          Клиент <span className="text-red-500">*</span>
        </label>
        <ClientSelect
          shopId={shopId}
          onSelect={(id) => setData({ ...data, clientId: id })}
          selectedId={data.clientId}
        />
        {errors.clientId && (
          <p className="mt-1 text-xs text-red-500">{errors.clientId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Услуга <span className="text-red-500">*</span>
        </label>
        <select
          value={data.serviceId}
          onChange={(e) => setData({ ...data, serviceId: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Выберите услугу</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.duration_min} мин)
            </option>
          ))}
        </select>
        {errors.serviceId && (
          <p className="mt-1 text-xs text-red-500">{errors.serviceId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Мастер <span className="text-red-500">*</span>
        </label>
        <select
          value={data.specialistId}
          onChange={(e) => setData({ ...data, specialistId: e.target.value })}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
        >
          <option value="">Выберите мастера</option>
          {specialists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        {errors.specialistId && (
          <p className="mt-1 text-xs text-red-500">{errors.specialistId}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Дата и время <span className="text-red-500">*</span>
        </label>
        <Input
          type="datetime-local"
          value={data.startsAt}
          onChange={(e) => setData({ ...data, startsAt: e.target.value })}
          className={errors.startsAt ? "border-red-500" : ""}
        />
        {errors.startsAt && (
          <p className="mt-1 text-xs text-red-500">{errors.startsAt}</p>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
      >
        {isLoading ? "Создание..." : "Создать запись"}
      </button>
    </form>
  );
}