"use client";

import { useState } from "react";
import { CreditCard, Zap, Crown } from "lucide-react";

type Plan = {
  id: string;
  name: string;
  price: number;
  description: string;
  features: string[];
  icon: React.ElementType;
};

const PLANS: Plan[] = [
  {
    id: "free",
    name: "Бесплатный",
    price: 0,
    description: "Для старта и тестирования",
    features: ["До 100 клиентов", "До 5 специалистов", "Базовые отчёты"],
    icon: Zap,
  },
  {
    id: "pro",
    name: "PRO",
    price: 2990,
    description: "Для растущего бизнеса",
    features: [
      "Неограниченно клиентов",
      "Неограниченно специалистов",
      "Аналитика и отчёты",
      "Промокоды и акции",
    ],
    icon: Crown,
  },
];

export default function SuperAdminSubscriptions() {
  const [selectedPlan, setSelectedPlan] = useState<string>("free");

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <CreditCard className="h-6 w-6 text-neutral-900" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Подписки</h1>
          <p className="text-sm text-neutral-500">Управление тарифами и планами</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border p-6 transition ${
              selectedPlan === plan.id
                ? "border-neutral-900 bg-neutral-50"
                : "border-neutral-200 bg-white hover:border-neutral-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <plan.icon className="h-6 w-6 text-neutral-600" />
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                plan.id === "free"
                  ? "bg-neutral-100 text-neutral-600"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {plan.id === "free" ? "Базовый" : "Популярный"}
              </span>
            </div>

            <h3 className="mt-4 text-lg font-semibold text-neutral-900">{plan.name}</h3>
            <p className="text-sm text-neutral-500">{plan.description}</p>

            <div className="mt-4">
              <span className="text-2xl font-bold text-neutral-900">
                {plan.price === 0 ? "Бесплатно" : `${plan.price} ₽`}
              </span>
              {plan.price > 0 && (
                <span className="text-sm text-neutral-400">/месяц</span>
              )}
            </div>

            <ul className="mt-4 space-y-2 text-sm">
              {plan.features.map((feature, i) => (
                <li key={i} className="flex items-center gap-2 text-neutral-600">
                  <span className="text-emerald-500">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <button
              onClick={() => setSelectedPlan(plan.id)}
              className={`mt-6 w-full rounded-lg px-4 py-2 text-sm font-medium transition ${
                selectedPlan === plan.id
                  ? "bg-neutral-900 text-white hover:bg-neutral-800"
                  : "border border-neutral-300 text-neutral-700 hover:bg-neutral-50"
              }`}
            >
              {selectedPlan === plan.id ? "Выбран" : "Выбрать"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}