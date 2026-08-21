"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { useShop } from "@/contexts/ShopContext"; // 👈 Добавляем

type Currency = {
  id: number;
  code: string;
  symbol: string;
  name: string;
};

// Форматирование телефона
const formatPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  let formatted = digits;
  if (formatted.startsWith("8")) {
    formatted = "7" + formatted.slice(1);
  }
  if (!formatted.startsWith("7") && formatted.length > 0) {
    formatted = "7" + formatted;
  }
  const limited = formatted.slice(0, 11);
  if (limited.length <= 1) {
    return limited === "7" ? "+7" : "";
  }
  let result = "+7";
  if (limited.length > 1) {
    const area = limited.slice(1, 4);
    result += ` (${area}`;
  }
  if (limited.length > 4) {
    const first = limited.slice(4, 7);
    result += `) ${first}`;
  }
  if (limited.length > 7) {
    const second = limited.slice(7, 9);
    result += `-${second}`;
  }
  if (limited.length > 9) {
    const third = limited.slice(9, 11);
    result += `-${third}`;
  }
  return result;
};

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createClient();
  const { refreshCurrency } = useShop(); // 👈 Добавляем метод обновления валюты
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [shop, setShop] = useState({
    id: 0,
    name: "",
    phone: "",
    email: "",
    contact_name: "",
    address: "",
    inn: "",
    ogrn: "",
    logo: "",
    plan_id: 1,
    subscription_expires_at: null as string | null,
    currency_id: 1,
  });

  useEffect(() => {
    async function loadShop() {
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

      if (!admin?.shop_id) {
        router.push("/onboarding");
        return;
      }

      // Загружаем валюты
      const { data: currenciesData } = await supabase
        .from("currencies")
        .select("*")
        .order("id");

      setCurrencies(currenciesData || []);

      // Загружаем салон
      const { data: shopData, error } = await supabase
        .from("shops")
        .select("*")
        .eq("id", admin.shop_id)
        .single();

      if (error) {
        console.error('❌ Ошибка загрузки салона:', error);
        toast.error("Не удалось загрузить данные салона");
        setLoading(false);
        return;
      }

      setShop({
        id: shopData.id,
        name: shopData.name || "",
        phone: shopData.phone || "",
        email: shopData.email || "",
        contact_name: shopData.contact_name || "",
        address: shopData.address || "",
        inn: shopData.inn ? String(shopData.inn) : "",
        ogrn: shopData.ogrn ? String(shopData.ogrn) : "",
        logo: shopData.logo || "",
        plan_id: shopData.plan_id || 1,
        subscription_expires_at: shopData.subscription_expires_at || null,
        currency_id: shopData.currency_id || 1,
      });
      
      setLoading(false);
    }

    loadShop();
  }, [router, supabase]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setShop({ ...shop, phone: "+7" });
      return;
    }
    if (raw === "+7") {
      setShop({ ...shop, phone: raw });
      return;
    }
    const formatted = formatPhone(raw);
    setShop({ ...shop, phone: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const cleanPhone = shop.phone.replace(/\D/g, "");
    if (cleanPhone.length > 0 && cleanPhone.length !== 11) {
      toast.error("Телефон должен содержать 11 цифр");
      setSaving(false);
      return;
    }

    if (shop.email && !shop.email.includes("@")) {
      toast.error("Введите корректный email");
      setSaving(false);
      return;
    }

    if (shop.inn && ![10, 12].includes(shop.inn.length)) {
      toast.error("ИНН должен содержать 10 или 12 цифр");
      setSaving(false);
      return;
    }

    if (shop.ogrn && ![13, 15].includes(shop.ogrn.length)) {
      toast.error("ОГРН должен содержать 13 или 15 цифр");
      setSaving(false);
      return;
    }

    // Сохраняем текущую валюту для проверки изменений
    const oldCurrencyId = shop.currency_id;
    const newCurrencyId = Number(shop.currency_id);

    const { error } = await supabase
      .from("shops")
      .update({
        name: shop.name.trim(),
        phone: shop.phone.trim() || null,
        email: shop.email.trim() || null,
        contact_name: shop.contact_name.trim() || null,
        address: shop.address.trim() || null,
        inn: shop.inn ? Number(shop.inn) : null,
        ogrn: shop.ogrn ? Number(shop.ogrn) : null,
        currency_id: newCurrencyId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", shop.id);

    if (error) {
      console.error('❌ Ошибка сохранения:', error);
      toast.error("Не удалось сохранить изменения");
      setSaving(false);
      return;
    }

    toast.success("Данные сохранены");

    // 👇 Если валюта изменилась - обновляем контекст и страницу
    if (oldCurrencyId !== newCurrencyId) {
      console.log('🔄 Валюта изменена, обновляем контекст...');
      await refreshCurrency(); // Обновляем валюту в контексте
      
      // Отправляем событие для обновления всех компонентов
      window.dispatchEvent(new Event('currency-changed'));
      
      // Обновляем страницу
      router.refresh();
    }

    setSaving(false);
  };

  const getPlanName = (planId: number) => {
    switch (planId) {
      case 1:
        return "Бесплатный";
      case 2:
        return "PRO";
      case 3:
        return "PRO + 3 модуля";
      default:
        return "Неизвестно";
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "Не активна";
    const d = new Date(date);
    return d.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const isSubscriptionActive = () => {
    if (!shop.subscription_expires_at) return false;
    return new Date(shop.subscription_expires_at) > new Date();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      {/* ============================================================ */}
      {/* БЛОК ТАРИФА */}
      {/* ============================================================ */}
      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-neutral-400" />
            <div>
              <p className="text-sm font-medium text-neutral-900">Мой тариф</p>
              <p className="text-xs text-neutral-500">
                {getPlanName(shop.plan_id)}
              </p>
            </div>
          </div>
          <Link
            href="/tariffs"
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            {isSubscriptionActive() ? "Продлить →" : "Выбрать тариф →"}
          </Link>
        </div>
        <div className="mt-2 border-t border-neutral-100 pt-2">
          <p className="text-xs text-neutral-400">
            {isSubscriptionActive() ? (
              <>Действует до: <span className="font-medium text-neutral-600">{formatDate(shop.subscription_expires_at)}</span></>
            ) : (
              <span className="text-amber-600">Подписка не активна</span>
            )}
          </p>
        </div>
      </div>

      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
        Настройки салона
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Основная информация о вашем салоне
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Название салона <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={shop.name}
            onChange={(e) => setShop({ ...shop, name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Контактное лицо
          </label>
          <input
            type="text"
            value={shop.contact_name}
            onChange={(e) => setShop({ ...shop, contact_name: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder="Иванов Иван Иванович"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Email для связи
          </label>
          <input
            type="email"
            value={shop.email}
            onChange={(e) => setShop({ ...shop, email: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder="salon@example.com"
          />
          <p className="mt-1 text-xs text-neutral-400">
            На этот email будут приходить уведомления
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Телефон
          </label>
          <input
            type="tel"
            value={shop.phone}
            onChange={handlePhoneChange}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder="+7 (999) 123-45-67"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Формат: +7 (XXX) XXX-XX-XX
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Адрес
          </label>
          <input
            type="text"
            value={shop.address}
            onChange={(e) => setShop({ ...shop, address: e.target.value })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder="Москва, ул. Тверская, д. 1"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            ИНН
          </label>
          <input
            type="text"
            value={shop.inn}
            onChange={(e) =>
              setShop({ ...shop, inn: e.target.value.replace(/\D/g, "").slice(0, 12) })
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder="1234567890"
          />
          <p className="mt-1 text-xs text-neutral-400">10 или 12 цифр</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700">
            ОГРН
          </label>
          <input
            type="text"
            value={shop.ogrn}
            onChange={(e) =>
              setShop({ ...shop, ogrn: e.target.value.replace(/\D/g, "").slice(0, 15) })
            }
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
            placeholder="1234567890123"
          />
          <p className="mt-1 text-xs text-neutral-400">13 или 15 цифр</p>
        </div>

        {/* ============================================================ */}
        {/* 🔥 ВАЛЮТА */}
        {/* ============================================================ */}
        <div>
          <label className="block text-sm font-medium text-neutral-700">
            Валюта
          </label>
          <select
            value={shop.currency_id}
            onChange={(e) => setShop({ ...shop, currency_id: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
          >
            <option value="">-- Выберите валюту --</option>
            {currencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.symbol} — {c.name} ({c.code})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            Все цены в салоне и мини-приложении будут отображаться в выбранной валюте
          </p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
        >
          {saving ? "Сохраняем..." : "Сохранить изменения"}
        </button>
      </form>
    </div>
  );
}