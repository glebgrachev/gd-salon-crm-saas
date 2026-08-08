"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Plan = {
  id: number;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  features: Record<string, number>;
  is_active: boolean;
  sort_order: number;
};

// Маппинг ключей модулей на человеческие названия
const MODULE_LABELS: Record<string, string> = {
  'clients': 'Клиентов в месяц',
  'bookings': 'Записей',
  'specialists': 'Мастеров',
  'analytics': 'Аналитика',
  'loyalty': 'Лояльность',
  'newsletters': 'Рассылки',
  'retention': 'Возвращаемость',
  'promotions': 'Акции',
  'certificates': 'Сертификаты',
  'stock': 'Склад',
  'waitlist': 'Лист ожидания'
};

// Форматирование значения для отображения
const formatModuleValue = (value: number): string => {
  if (value === -1) return '∞';
  return String(value);
};

const PUBLISHABLE_KEY = "sb_publishable_vTWBLzZsUEq475a6qRKhuw_WP3XiiCX";

export default function TariffsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);

  async function loadData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("shop_id")
        .eq("user_uid", user.id)
        .single();

      if (admin?.shop_id) {
        const { data: shop } = await supabase
          .from("shops")
          .select("plan_id")
          .eq("id", admin.shop_id)
          .single();
        
        if (shop) {
          setCurrentPlanId(shop.plan_id);
        }
      }

      // Загружаем планы с features
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");

      if (error) {
        console.error("Ошибка загрузки тарифов:", error);
        setLoading(false);
        return;
      }

      setPlans(data || []);
    } catch (error) {
      console.error("Ошибка загрузки:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, supabase]);

  useEffect(() => {
    const handleFocus = () => {
      loadData();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleActivate = async (planId: number) => {
    setActivating(planId);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Пожалуйста, войдите в систему");
        setActivating(null);
        return;
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("shop_id")
        .eq("user_uid", user.id)
        .single();

      if (!admin?.shop_id) {
        toast.error("Салон не найден");
        setActivating(null);
        return;
      }

      const response = await fetch(
        "https://cmzqpjfckzftlptrozdf.supabase.co/functions/v1/create-payment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            shop_id: admin.shop_id,
            plan_id: planId,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        toast.error(data.error || "Не удалось создать платёж");
        setActivating(null);
        return;
      }

      if (data.paymentUrl) {
        window.open(data.paymentUrl, "_blank");
        toast.info("Оплата открыта в новом окне.");
        router.push(`/payment-success?payment_id=${data.paymentId}`);
      } else {
        toast.error("Не удалось получить ссылку на оплату");
      }
    } catch (error) {
      console.error(error);
      toast.error("Произошла ошибка при создании платежа");
    } finally {
      setActivating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Выберите тариф</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ваш текущий тариф:{" "}
          <span className="font-medium text-neutral-900">
            {plans.find((p) => p.id === currentPlanId)?.name || "СТАРТ"}
          </span>
        </p>
        <button
          onClick={() => {
            setLoading(true);
            loadData().then(() => setLoading(false));
          }}
          className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 transition"
        >
          Обновить статус
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isPopular = plan.sort_order === 2;
          const priceDisplay = plan.price_monthly === 0 ? "0 ₽" : `${plan.price_monthly} ₽`;
          
          // Получаем все ключи модулей из features
          const moduleKeys = Object.keys(plan.features || {});
          
          // Разделяем на базовые (clients, bookings, specialists) и дополнительные
          const baseKeys = ['clients', 'bookings', 'specialists'];
          const baseModules = moduleKeys.filter(key => baseKeys.includes(key));
          const extraModules = moduleKeys.filter(key => !baseKeys.includes(key));

          return (
            <div
              key={plan.id}
              className={`relative rounded-2xl border p-6 transition flex flex-col ${
                isCurrent
                  ? "border-neutral-900 bg-neutral-50 shadow-md"
                  : isPopular
                  ? "border-neutral-200 bg-white shadow-sm hover:shadow-md"
                  : "border-neutral-200 bg-white hover:shadow-sm"
              }`}
            >
              {isCurrent && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
                  ✅ Вы сейчас на этом тарифе
                </span>
              )}
              {isPopular && !isCurrent && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-medium text-amber-700">
                  Популярный
                </span>
              )}

              <div className="flex-1">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-neutral-900">{plan.name}</h3>
                  <div className="mt-1">
                    <span className="text-3xl font-bold text-neutral-900">{priceDisplay}</span>
                    {plan.price_monthly > 0 && (
                      <span className="text-sm text-neutral-500">/мес</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-neutral-500">{plan.description}</p>
                </div>

                {/* Базовые модули с лимитами */}
                <ul className="space-y-2 text-sm">
                  {baseModules.map((key) => {
                    const value = plan.features[key];
                    const label = MODULE_LABELS[key] || key;
                    const displayValue = formatModuleValue(value);
                    const isUnlimited = value === -1;
                    
                    return (
                      <li key={key} className="flex items-start gap-2 text-neutral-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>
                          {label}: <span className="font-medium">{displayValue}</span>
                          {isUnlimited && <span className="text-xs text-neutral-400 ml-1">(безлимит)</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* Дополнительные модули */}
                {extraModules.length > 0 && (
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <p className="text-xs font-medium text-neutral-400">Дополнительные модули:</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {extraModules.map((key) => {
                        const label = MODULE_LABELS[key] || key;
                        return (
                          <li key={key} className="flex items-start gap-2 text-neutral-600">
                            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span>{label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-6">
                {isCurrent && plan.price_monthly === 0 ? (
                  <button
                    disabled
                    className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-2 text-sm font-medium text-neutral-500 cursor-default"
                  >
                    Текущий тариф
                  </button>
                ) : isCurrent ? (
                  <button
                    onClick={() => handleActivate(plan.id)}
                    disabled={activating === plan.id}
                    className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition bg-neutral-900 hover:bg-neutral-700 disabled:opacity-50"
                  >
                    {activating === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Обработка...
                      </span>
                    ) : (
                      "Продлить"
                    )}
                  </button>
                ) : currentPlanId && currentPlanId > plan.id ? (
                  <button
                    disabled
                    className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-400 cursor-not-allowed"
                  >
                    У вас более высокий тариф
                  </button>
                ) : (
                  <button
                    onClick={() => handleActivate(plan.id)}
                    disabled={activating === plan.id}
                    className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
                      plan.price_monthly === 0
                        ? "bg-neutral-300 hover:bg-neutral-400 cursor-not-allowed"
                        : "bg-neutral-900 hover:bg-neutral-700"
                    } disabled:opacity-50`}
                  >
                    {activating === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Обработка...
                      </span>
                    ) : (
                      plan.price_monthly === 0 ? "Вы на тарифе СТАРТ" : "Активировать"
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-center text-xs text-neutral-400">
        <p>Все тарифы включают базовую CRM и Telegram-мини-приложение.</p>
        <p className="mt-1">
          Вопросы по тарифам:{" "}
          <a href="mailto:support@beautyapp.ru" className="text-neutral-600 hover:underline">
            support@beautyapp.ru
          </a>
        </p>
      </div>
    </div>
  );
}