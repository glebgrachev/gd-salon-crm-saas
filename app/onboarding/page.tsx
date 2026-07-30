"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    contact_name: "",
    address: "",
    inn: "",
    ogrn: "",
  });

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setForm({ ...form, phone: "+7" });
      return;
    }
    if (raw === "+7") {
      setForm({ ...form, phone: raw });
      return;
    }
    const formatted = formatPhone(raw);
    setForm({ ...form, phone: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const cleanPhone = form.phone.replace(/\D/g, "");
    if (cleanPhone.length !== 11) {
      setError("Введите корректный номер телефона в формате +7 (XXX) XXX-XX-XX");
      setLoading(false);
      return;
    }

    if (form.email && !form.email.includes("@")) {
      setError("Введите корректный email");
      setLoading(false);
      return;
    }

    if (form.inn && ![10, 12].includes(form.inn.length)) {
      setError("ИНН должен содержать 10 или 12 цифр");
      setLoading(false);
      return;
    }

    if (form.ogrn && ![13, 15].includes(form.ogrn.length)) {
      setError("ОГРН должен содержать 13 или 15 цифр");
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("Пользователь не найден. Войдите заново.");
      setLoading(false);
      return;
    }

    // Создаём салон
    const { data: shop, error: shopError } = await supabase
      .from("shops")
      .insert({
        owner_id: user.id,
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        contact_name: form.contact_name.trim() || null,
        address: form.address.trim() || null,
        inn: form.inn ? Number(form.inn) : null,
        ogrn: form.ogrn ? Number(form.ogrn) : null,
        plan: "free",
      })
      .select()
      .single();

    if (shopError || !shop) {
      console.error("Ошибка создания салона:", shopError);
      setError("Не удалось создать салон. Попробуйте ещё раз.");
      setLoading(false);
      return;
    }

    // Обновляем admins
    const { error: adminError } = await supabase
      .from("admins")
      .update({ shop_id: shop.id })
      .eq("user_uid", user.id);

    if (adminError) {
      console.error("Ошибка обновления админа:", adminError);
      setError("Не удалось привязать салон. Попробуйте ещё раз.");
      setLoading(false);
      return;
    }

    router.push("/");
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-neutral-900 text-center mb-2">
          Создайте свой салон
        </h1>
        <p className="text-sm text-neutral-500 text-center mb-6">
          Заполните основную информацию. Остальное можно будет добавить позже.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Название салона */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Название салона <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="Мой салон красоты"
              required
            />
          </div>

          {/* Контактное лицо */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Контактное лицо <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.contact_name}
              onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="Иванов Иван Иванович"
              required
            />
          </div>

          {/* Телефон */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Телефон <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={handlePhoneChange}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="+7 (999) 123-45-67"
              required
            />
            <p className="mt-1 text-xs text-neutral-400">
              Формат: +7 (XXX) XXX-XX-XX
            </p>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Email для связи
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="salon@example.com"
            />
            <p className="mt-1 text-xs text-neutral-400">
              На этот email будут приходить уведомления
            </p>
          </div>

          {/* Адрес */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Адрес
            </label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="Москва, ул. Тверская, д. 1"
            />
          </div>

          {/* ИНН */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              ИНН
            </label>
            <input
              type="text"
              value={form.inn}
              onChange={(e) => setForm({ ...form, inn: e.target.value.replace(/\D/g, "").slice(0, 12) })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="1234567890"
            />
            <p className="mt-1 text-xs text-neutral-400">10 или 12 цифр</p>
          </div>

          {/* ОГРН */}
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              ОГРН
            </label>
            <input
              type="text"
              value={form.ogrn}
              onChange={(e) => setForm({ ...form, ogrn: e.target.value.replace(/\D/g, "").slice(0, 15) })}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="1234567890123"
            />
            <p className="mt-1 text-xs text-neutral-400">13 или 15 цифр</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {loading ? "Создаём..." : "Создать салон"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-neutral-400">
          Остальные настройки можно будет добавить в профиле салона.
        </p>
      </div>
    </main>
  );
}