"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Check, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Module = {
  id: number;
  label: string;
  description: string | null;
};

type Plan = {
  id: number;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number | null;
  features: {
    clients: number;
    specialists: number;
    bookings: number;
  };
  modules: Module[];
  is_active: boolean;
  sort_order: number;
};

const PUBLISHABLE_KEY = "sb_publishable_vTWBLzZsUEq475a6qRKhuw_WP3XiiCX";

export default function TariffsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [currentPlanId, setCurrentPlanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState<number | null>(null);

  // Функция загрузки данных
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
        // Загружаем текущий план салона
        const { data: shop } = await supabase
          .from("shops")
          .select("plan_id")
          .eq("id", admin.shop_id)
          .single();
        
        if (shop) {
          console.log(`📊 Текущий plan_id салона: ${shop.plan_id}`);
          setCurrentPlanId(shop.plan_id);
        }
      }

      // Загружаем все планы
      const { data, error } = await supabase
        .from("plans")
        .select(`
          *,
          plan_modules(
            sort_order,
            modules:module_id(*)
          )
        `)
        .eq("is_active", true)
        .order("sort_order");

      if (error) {
        console.error("Ошибка загрузки тарифов:", error);
        setLoading(false);
        return;
      }

      const formattedPlans: Plan[] = (data || []).map((p: any) => ({
        ...p,
        modules: (p.plan_modules || [])
          .filter((pm: any) => pm.modules)
          .map((pm: any) => pm.modules)
          .sort((a: Module, b: Module) => {
            const orderA = p.plan_modules.find((pm: any) => pm.module_id === a.id)?.sort_order || 0;
            const orderB = p.plan_modules.find((pm: any) => pm.module_id === b.id)?.sort_order || 0;
            return orderA - orderB;
          }),
      }));

      setPlans(formattedPlans);
    } catch (error) {
      console.error("Ошибка загрузки:", error);
    } finally {
      setLoading(false);
    }
  }

  // Загрузка при монтировании и при возврате на страницу
  useEffect(() => {
    loadData();

    // Слушаем событие возврата на страницу (когда пользователь возвращается из оплаты)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Страница стала видимой, обновляем данные...');
        loadData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router, supabase]);

  // Дополнительно обновляем при фокусе окна
  useEffect(() => {
    const handleFocus = () => {
      console.log('🔄 Окно в фокусе, обновляем данные...');
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
        // Открываем оплату в новом окне
        window.open(data.paymentUrl, "_blank");
        toast.info("Оплата открыта в новом окне.");

        // Переходим на страницу успеха с payment_id
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
        <Link
          href="/settings"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-900 transition"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад в настройки
        </Link>
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold text-neutral-900">Выберите тариф</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Ваш текущий тариф:{" "}
          <span className="font-medium text-neutral-900">
            {plans.find((p) => p.id === currentPlanId)?.name || "Старт"}
          </span>
        </p>
        {/* Кнопка для ручного обновления */}
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
              {isPopular && (
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

                <ul className="space-y-2 text-sm">
                  {plan.features.clients === -1 ? (
                    <li className="flex items-start gap-2 text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>Неограниченно клиентов</span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>До {plan.features.clients} клиентов</span>
                    </li>
                  )}
                  {plan.features.specialists === -1 ? (
                    <li className="flex items-start gap-2 text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>Неограниченно специалистов</span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>До {plan.features.specialists} специалистов</span>
                    </li>
                  )}
                  {plan.features.bookings === -1 ? (
                    <li className="flex items-start gap-2 text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>Неограниченно записей</span>
                    </li>
                  ) : (
                    <li className="flex items-start gap-2 text-neutral-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <span>До {plan.features.bookings} записей/мес</span>
                    </li>
                  )}
                </ul>

                {plan.modules.length > 0 && (
                  <div className="mt-3 border-t border-neutral-100 pt-3">
                    <p className="text-xs font-medium text-neutral-400">Включено:</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {plan.modules.map((mod) => (
                        <li key={mod.id} className="flex items-start gap-2 text-neutral-600">
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                          <span>{mod.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-auto pt-6">
                {isCurrent ? (
                  <button
                    disabled
                    className="w-full rounded-lg border border-neutral-300 bg-transparent px-4 py-2 text-sm font-medium text-neutral-500 cursor-default"
                  >
                    ✅ Текущий тариф
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
                      plan.price_monthly === 0 ? "Вы на тарифе Старт" : "Активировать"
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