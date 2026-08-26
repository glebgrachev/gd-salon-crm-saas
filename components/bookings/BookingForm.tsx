"use client";

import { useState, useEffect } from "react";
import { ClientSelect } from "./ClientSelect";
import { DateTimePicker } from "./DateTimePicker";
import { useShop } from "@/contexts/ShopContext";

type Service = {
  id: string;
  name: string;
  duration_min: number;
  price: number;
};

type Specialist = {
  id: string;
  full_name: string;
  price?: number;
};

type BookingFormData = {
  clientId: number | null;
  serviceId: string;
  specialistId: string;
  startsAt: string;
  shopId: number; // 👈 ДОБАВЛЯЕМ
};

type BookingFormProps = {
  onSubmit: (data: BookingFormData) => void;
  isLoading?: boolean;
};

export function BookingForm({ onSubmit, isLoading }: BookingFormProps) {
  const { shopId } = useShop();
  const [data, setData] = useState<BookingFormData>({
    clientId: null,
    serviceId: "",
    specialistId: "",
    startsAt: "",
    shopId: shopId || 0, // 👈 ДОБАВЛЯЕМ
  });

  const [services, setServices] = useState<Service[]>([]);
  const [filteredSpecialists, setFilteredSpecialists] = useState<Specialist[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [loadingSpecialists, setLoadingSpecialists] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Загружаем услуги
  useEffect(() => {
    if (shopId) {
      loadServices();
    }
  }, [shopId]);

  // При выборе услуги — загружаем мастеров для неё
  useEffect(() => {
    if (data.serviceId && shopId) {
      loadSpecialistsForService(data.serviceId);
    } else {
      setFilteredSpecialists([]);
    }
  }, [data.serviceId, shopId]);

  const loadServices = async () => {
    if (!shopId) return;
    setLoadingServices(true);
    try {
      const res = await fetch(`/api/admin/services?shopId=${shopId}`);
      const result = await res.json();
      if (result.ok) {
        setServices(result.services);
      }
    } catch (error) {
      console.error("Ошибка загрузки услуг:", error);
    } finally {
      setLoadingServices(false);
    }
  };

  const loadSpecialistsForService = async (serviceId: string) => {
    if (!shopId) return;
    setLoadingSpecialists(true);
    try {
      const res = await fetch(
        `/api/admin/specialists?shopId=${shopId}&serviceId=${serviceId}`
      );
      const result = await res.json();
      if (result.ok) {
        setFilteredSpecialists(result.specialists);
      }
    } catch (error) {
      console.error("Ошибка загрузки мастеров:", error);
    } finally {
      setLoadingSpecialists(false);
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!data.clientId) newErrors.clientId = "Выберите клиента";
    if (!data.serviceId) newErrors.serviceId = "Выберите услугу";
    if (!data.specialistId) newErrors.specialistId = "Выберите мастера";
    if (!data.startsAt) newErrors.startsAt = "Выберите время";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      // ✅ Передаём все данные, включая shopId
      onSubmit({
        ...data,
        shopId: shopId || 0,
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-neutral-700">
          Клиент <span className="text-red-500">*</span>
        </label>
        <ClientSelect
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
          onChange={(e) => {
            setData({ ...data, serviceId: e.target.value, specialistId: "", startsAt: "" });
          }}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
          disabled={loadingServices}
        >
          <option value="">{loadingServices ? "Загрузка..." : "Выберите услугу"}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.duration_min} мин) — {s.price} ₽
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
          onChange={(e) => {
            setData({ ...data, specialistId: e.target.value, startsAt: "" });
          }}
          className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
          disabled={loadingSpecialists || !data.serviceId}
        >
          <option value="">
            {!data.serviceId 
              ? "Сначала выберите услугу" 
              : loadingSpecialists 
                ? "Загрузка..." 
                : filteredSpecialists.length === 0
                  ? "Нет мастеров для этой услуги"
                  : "Выберите мастера"}
          </option>
          {filteredSpecialists.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name} {s.price ? `(${s.price} ₽)` : ""}
            </option>
          ))}
        </select>
        {errors.specialistId && (
          <p className="mt-1 text-xs text-red-500">{errors.specialistId}</p>
        )}
      </div>

      <div>
        <DateTimePicker
          value={data.startsAt}
          onChange={(val) => setData({ ...data, startsAt: val })}
          error={errors.startsAt}
          specialistId={data.specialistId}
          serviceId={data.serviceId}
          shopId={shopId}
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50 transition"
      >
        {isLoading ? "Создание..." : "Создать запись"}
      </button>
    </form>
  );
}