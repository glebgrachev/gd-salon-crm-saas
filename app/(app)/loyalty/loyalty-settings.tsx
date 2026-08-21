"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useShop } from "@/contexts/ShopContext"; // 👈 Добавляем
import { updateLoyaltySettings } from "./actions";

type Settings = {
  cashback_percent: number;
  redeem_max_percent: number;
  point_value: number;
};

type Stats = { clients: number; balance: number; earned: number; spent: number };

export default function LoyaltySettings({
  initial,
  stats,
}: {
  initial: Settings;
  stats: Stats;
}) {
  const { currency } = useShop(); // 👈 Добавляем валюту
  
  const [cashback, setCashback] = useState(String(initial.cashback_percent));
  const [redeemMax, setRedeemMax] = useState(String(initial.redeem_max_percent));
  const [pointValue, setPointValue] = useState(String(initial.point_value));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const r = await updateLoyaltySettings({
        cashback_percent: parseFloat(cashback.replace(",", ".")),
        redeem_max_percent: parseFloat(redeemMax.replace(",", ".")),
        point_value: parseFloat(pointValue.replace(",", ".")),
      });
      if (r.ok) toast.success("Настройки сохранены");
      else toast.error(r.error ?? "Не удалось сохранить");
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Лояльность</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Кешбэк баллами и условия их списания. Баллы начисляются при статусе «Оплачено».
      </p>

      {/* сводка */}
      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat label="Клиентов с баллами" value={String(stats.clients)} />
        <Stat label="Баллов на балансах" value={String(stats.balance)} />
        <Stat label="Всего начислено" value={String(stats.earned)} />
        <Stat label="Всего списано" value={String(stats.spent)} />
      </div>

      {/* настройки */}
      <div className="mt-6 space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
        <Field
          label="Кешбэк, %"
          hint="Процент от оплаченной суммы, который начисляется баллами."
          value={cashback}
          onChange={setCashback}
          suffix="%"
        />
        <Field
          label="Максимальная оплата баллами, %"
          hint="Какую долю заказа клиент может закрыть баллами."
          value={redeemMax}
          onChange={setRedeemMax}
          suffix="%"
        />
        <Field
          label={`Стоимость балла, ${currency?.symbol || '₽'}`} // 👈 Динамический символ
          hint="Сколько рублей стоит 1 балл при списании."
          value={pointValue}
          onChange={setPointValue}
          suffix={currency?.symbol || '₽'} // 👈 Динамический символ
        />

        <div className="pt-2">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  value,
  onChange,
  suffix,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-800">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        {suffix && <span className="text-sm text-neutral-500">{suffix}</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-400">{hint}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}