"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Phone,
  Mail,
  User,
  MapPin,
  Users,
  CalendarCheck,
  CreditCard,
  Bot,
  Copy,
  Check,
} from "lucide-react";

type Shop = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  contact_name: string | null;
  address: string;
  inn: number | null;
  ogrn: number | null;
  plan_id: number;
  modules: Record<string, boolean>;
  blocked: boolean;
  total_clients: number;
  total_bookings: number;
  total_specialists: number;
  created_at: string;
  subscription_expires_at: string | null;
  bot_token: string | null;
  bot_username: string | null;
  bot_name: string | null;
};

type Plan = {
  id: number;
  name: string;
  price_monthly: number;
};

// 🔥 Только платные модули (которые можно включать/выключать)
const PAID_MODULES = [
  // PRO модули
  { key: "analytics", label: "Аналитика" },
  { key: "loyalty", label: "Лояльность" },
  { key: "newsletters", label: "Рассылки" },
  { key: "retention", label: "Возвращаемость" },
  
  // PRO+ модули
  { key: "promotions", label: "Акции" },
  { key: "certificates", label: "Сертификаты" },
  { key: "stock", label: "Склад" },
  { key: "waitlist", label: "Лист ожидания" },
];

export default function ShopDetailPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const [shop, setShop] = useState<Shop | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function loadData() {
      const { data: shopData, error: shopError } = await supabase
        .from("shops")
        .select("*")
        .eq("id", params.id)
        .single();

      if (shopError) {
        toast.error("Не удалось загрузить данные салона");
        router.push("/superadmin/shops");
        return;
      }

      const { data: plansData } = await supabase
        .from("plans")
        .select("id, name, price_monthly")
        .order("sort_order");

      setShop(shopData);
      setPlans(plansData || []);
      setLoading(false);
    }

    loadData();
  }, [params.id, router, supabase]);

  const changePlan = async (planId: number) => {
    if (!shop) return;
    setSaving(true);

    try {
      const { data: plan } = await supabase
        .from("plans")
        .select("features")
        .eq("id", planId)
        .single();

      let newExpiryDate = null;
      
      if (planId === 1) {
        newExpiryDate = null;
      } else {
        const now = new Date();
        
        if (shop.subscription_expires_at) {
          const currentExpiry = new Date(shop.subscription_expires_at);
          if (currentExpiry > now) {
            newExpiryDate = new Date(currentExpiry);
            newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
            newExpiryDate.setHours(23, 59, 59, 999);
          } else {
            newExpiryDate = new Date();
            newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
            newExpiryDate.setHours(23, 59, 59, 999);
          }
        } else {
          newExpiryDate = new Date();
          newExpiryDate.setMonth(newExpiryDate.getMonth() + 1);
          newExpiryDate.setHours(23, 59, 59, 999);
        }
      }

      const updateData: any = {
        plan_id: planId,
        modules: plan?.features || {},
      };
      
      if (newExpiryDate !== null) {
        updateData.subscription_expires_at = newExpiryDate.toISOString();
      } else {
        updateData.subscription_expires_at = null;
      }

      const { error } = await supabase
        .from("shops")
        .update(updateData)
        .eq("id", shop.id);

      if (error) {
        toast.error("Не удалось изменить тариф");
      } else {
        setShop({ 
          ...shop, 
          plan_id: planId, 
          modules: plan?.features || {},
          subscription_expires_at: newExpiryDate ? newExpiryDate.toISOString() : null
        });
        
        const expiryText = newExpiryDate 
          ? `до ${newExpiryDate.toLocaleDateString('ru-RU')}` 
          : 'без подписки';
        toast.success(`Тариф изменён (${expiryText})`);
      }
    } catch (error) {
      toast.error("Ошибка при изменении тарифа");
    } finally {
      setSaving(false);
    }
  };

  const toggleModule = async (key: string) => {
    if (!shop) return;
    setSaving(true);

    const newModules = { ...shop.modules, [key]: !shop.modules[key] };
    const { error } = await supabase
      .from("shops")
      .update({ modules: newModules })
      .eq("id", shop.id);

    if (error) {
      toast.error("Не удалось обновить модуль");
    } else {
      setShop({ ...shop, modules: newModules });
      toast.success(`Модуль ${shop.modules[key] ? "выключен" : "включен"}`);
    }
    setSaving(false);
  };

  const toggleBlock = async () => {
    if (!shop) return;
    setSaving(true);

    const { error } = await supabase
      .from("shops")
      .update({ blocked: !shop.blocked })
      .eq("id", shop.id);

    if (error) {
      toast.error("Не удалось изменить статус");
    } else {
      setShop({ ...shop, blocked: !shop.blocked });
      toast.success(shop.blocked ? "Салон разблокирован" : "Салон заблокирован");
    }
    setSaving(false);
  };

  const saveBot = async () => {
    if (!shop) return;
    setSaving(true);

    const { error } = await supabase
      .from("shops")
      .update({
        bot_token: shop.bot_token,
        bot_username: shop.bot_username,
        bot_name: shop.bot_name,
      })
      .eq("id", shop.id);

    if (error) {
      toast.error("Не удалось сохранить данные бота");
    } else {
      toast.success("Данные бота сохранены");
    }
    setSaving(false);
  };

  const copyLink = () => {
    if (!shop?.bot_username) return;
    const link = `https://t.me/${shop.bot_username}?start=shop_${shop.id}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="p-8 text-center">
        <p className="text-neutral-500">Салон не найден</p>
        <Link
          href="/superadmin/shops"
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          Вернуться к списку
        </Link>
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.id === shop.plan_id);
  const botLinkWithShop = shop.bot_username 
    ? `https://t.me/${shop.bot_username}?start=shop_${shop.id}` 
    : null;

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center gap-4 flex-wrap">
        <Link
          href="/superadmin/shops"
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">{shop.name}</h1>
        <span
          className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
            shop.blocked ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {shop.blocked ? "Заблокирован" : "Активен"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Левая колонка — данные салона */}
        <div className="space-y-6">
          {/* Основные данные */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-neutral-900">Данные салона</h2>
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
                <Building2 className="h-5 w-5 text-neutral-400" />
                <div>
                  <p className="text-xs text-neutral-400">Название</p>
                  <p className="font-medium text-neutral-900">{shop.name}</p>
                </div>
              </div>

              {shop.contact_name && (
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
                  <User className="h-5 w-5 text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-400">Контактное лицо</p>
                    <p className="text-neutral-900">{shop.contact_name}</p>
                  </div>
                </div>
              )}

              {shop.email && (
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
                  <Mail className="h-5 w-5 text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-400">Email</p>
                    <p className="text-neutral-900">{shop.email}</p>
                  </div>
                </div>
              )}

              {shop.phone && (
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
                  <Phone className="h-5 w-5 text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-400">Телефон</p>
                    <p className="text-neutral-900">{shop.phone}</p>
                  </div>
                </div>
              )}

              {shop.address && (
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-3">
                  <MapPin className="h-5 w-5 text-neutral-400" />
                  <div>
                    <p className="text-xs text-neutral-400">Адрес</p>
                    <p className="text-neutral-900">{shop.address}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-neutral-100 pt-4">
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-900">{shop.total_clients}</p>
                <p className="text-xs text-neutral-400">Клиентов</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-900">{shop.total_bookings}</p>
                <p className="text-xs text-neutral-400">Записей</p>
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-neutral-900">{shop.total_specialists}</p>
                <p className="text-xs text-neutral-400">Специалистов</p>
              </div>
            </div>

            <button
              onClick={toggleBlock}
              disabled={saving}
              className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                shop.blocked
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-red-600 text-white hover:bg-red-700"
              } disabled:opacity-50`}
            >
              {shop.blocked ? "Разблокировать салон" : "Заблокировать салон"}
            </button>
          </div>

          {/* Блок бота */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bot className="h-5 w-5 text-neutral-400" />
              <h2 className="text-sm font-semibold text-neutral-900">Telegram бот</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Токен бота</label>
                <input
                  type="text"
                  value={shop.bot_token || ""}
                  onChange={(e) => setShop({ ...shop, bot_token: e.target.value || null })}
                  placeholder="1234567890:ABCdefGHIjklmNOPqrstUVwxyz"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  Получите токен у <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">@BotFather</a>
                </p>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Username бота</label>
                <input
                  type="text"
                  value={shop.bot_username || ""}
                  onChange={(e) => setShop({ ...shop, bot_username: e.target.value || null })}
                  placeholder="my_salon_bot"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
                <p className="mt-1 text-xs text-neutral-400">
                  Без @, например: <span className="font-mono">my_salon_bot</span>
                </p>
              </div>

              <div>
                <label className="block text-xs text-neutral-500 mb-1">Название бота</label>
                <input
                  type="text"
                  value={shop.bot_name || ""}
                  onChange={(e) => setShop({ ...shop, bot_name: e.target.value || null })}
                  placeholder="Салон Красоты"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                />
              </div>

              <button
                onClick={saveBot}
                disabled={saving}
                className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
              >
                {saving ? "Сохранение..." : "Сохранить бота"}
              </button>

              {botLinkWithShop && (
                <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-neutral-500 whitespace-nowrap pt-0.5">Ссылка:</span>
                      <a
                        href={botLinkWithShop}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 hover:underline break-all"
                      >
                        {botLinkWithShop}
                      </a>
                    </div>
                    <button
                      onClick={copyLink}
                      className="self-end flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Скопировано" : "Копировать ссылку"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Правая колонка — тариф и модули */}
        <div className="space-y-6">
          {/* Управление тарифом */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-neutral-400" />
              <h2 className="text-sm font-semibold text-neutral-900">Тариф</h2>
            </div>
            
            <div className="mt-4">
              <select
                value={shop.plan_id}
                onChange={(e) => changePlan(Number(e.target.value))}
                disabled={saving}
                className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:opacity-50"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} — {plan.price_monthly === 0 ? "Бесплатно" : `${plan.price_monthly} ₽/мес`}
                  </option>
                ))}
              </select>
              {currentPlan && (
                <p className="mt-2 text-xs text-neutral-400">
                  Текущий тариф: <span className="font-medium text-neutral-700">{currentPlan.name}</span>
                </p>
              )}
              {shop.subscription_expires_at && (
                <p className="mt-1 text-xs text-neutral-400">
                  Действует до:{" "}
                  <span className="font-medium text-neutral-700">
                    {new Date(shop.subscription_expires_at).toLocaleDateString("ru-RU")}
                  </span>
                </p>
              )}
              {!shop.subscription_expires_at && shop.plan_id !== 1 && (
                <p className="mt-1 text-xs text-amber-600">
                  ⚠️ Подписка не активна
                </p>
              )}
            </div>
          </div>

          {/* Модули */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-neutral-900">Дополнительные модули</h2>
            <p className="mt-1 text-xs text-neutral-400">
              Включайте/выключайте платные функции для салона
            </p>

            <div className="mt-4 space-y-2">
              {PAID_MODULES.map((mod) => {
                const isActive = shop.modules?.[mod.key] ?? false;
                return (
                  <div
                    key={mod.key}
                    className="flex items-center justify-between rounded-lg border border-neutral-100 px-4 py-3"
                  >
                    <span className="text-sm text-neutral-700">{mod.label}</span>
                    <button
                      onClick={() => toggleModule(mod.key)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                        isActive ? "bg-neutral-900" : "bg-neutral-300"
                      } disabled:opacity-50`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                          isActive ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            
            {/* Информация о базовых модулях */}
            <div className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
              <p>Базовые модули (всегда активны):</p>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 text-neutral-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Клиенты
                </span>
                <span className="inline-flex items-center gap-1 text-neutral-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Записи
                </span>
                <span className="inline-flex items-center gap-1 text-neutral-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Специалисты
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}