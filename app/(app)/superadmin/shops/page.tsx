"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Building2, Users, CalendarCheck, CreditCard } from "lucide-react";

type Shop = {
  id: number;
  name: string;
  phone: string;
  address: string;
  plan_id: number;
  plan_name: string;
  total_clients: number;
  total_bookings: number;
  total_specialists: number;
  created_at: string;
  blocked: boolean;
  verified: boolean;
  subscription_expires_at: string | null;
};

type Plan = {
  id: number;
  name: string;
};

export default function SuperAdminShops() {
  const supabase = createClient();
  const [shops, setShops] = useState<Shop[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      // Загружаем планы
      const { data: plansData } = await supabase
        .from("plans")
        .select("id, name")
        .order("sort_order");

      setPlans(plansData || []);

      // Загружаем салоны
      const { data, error } = await supabase
        .from("shops")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Ошибка загрузки салонов:", error);
      } else {
        // Добавляем название плана к каждому салону
        const shopsWithPlans = (data || []).map((shop) => {
          const plan = (plansData || []).find((p) => p.id === shop.plan_id);
          return {
            ...shop,
            plan_name: plan?.name || "СТАРТ",
          };
        });
        setShops(shopsWithPlans);
      }
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  // Функция для форматирования даты
  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // Функция для получения цвета тарифа
  const getPlanColor = (planId: number) => {
    switch (planId) {
      case 1:
        return "bg-neutral-100 text-neutral-600";
      case 2:
        return "bg-blue-100 text-blue-700";
      case 3:
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-neutral-100 text-neutral-600";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Все салоны</h1>
          <p className="text-sm text-neutral-500">Управление всеми салонами платформы</p>
        </div>
        <div className="text-sm text-neutral-500">
          Всего: <span className="font-medium text-neutral-900">{shops.length}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shops.map((shop) => (
          <Link
            key={shop.id}
            href={`/superadmin/shops/${shop.id}`}
            className="group block rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100">
                  <Building2 className="h-5 w-5 text-neutral-600" />
                </div>
                <div>
                  <h3 className="font-medium text-neutral-900 group-hover:underline">
                    {shop.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPlanColor(shop.plan_id)}`}>
                      {shop.plan_name}
                    </span>
                    {shop.blocked && (
                      <span className="text-xs text-red-500">🔒 Заблокирован</span>
                    )}
                    {shop.subscription_expires_at && (
                      <span className="text-xs text-neutral-400">
                        до {formatDate(shop.subscription_expires_at)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="text-xs text-neutral-400">
                {new Date(shop.created_at).toLocaleDateString("ru-RU")}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 border-t border-neutral-100 pt-4 text-xs">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neutral-600">
                  <Users className="h-3.5 w-3.5" />
                  <span>{shop.total_clients}</span>
                </div>
                <span className="text-neutral-400">Клиентов</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neutral-600">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  <span>{shop.total_bookings}</span>
                </div>
                <span className="text-neutral-400">Записей</span>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-neutral-600">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{shop.total_specialists}</span>
                </div>
                <span className="text-neutral-400">Специалистов</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {shops.length === 0 && (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300">
          <p className="text-sm text-neutral-500">Салонов пока нет</p>
        </div>
      )}
    </div>
  );
}