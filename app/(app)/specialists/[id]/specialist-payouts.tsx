"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  savePayoutRules,
  setServicePayout,
  removeServicePayout,
  type PayoutRules,
} from "./actions";

export type ServicePayout = {
  service_id: string;
  payout_type: "percent" | "fixed";
  payout_value: number;
};

export type OfferedSvc = { service_id: string; name: string };

const SALARY_MODE_LABEL: Record<PayoutRules["salary_mode"], string> = {
  full_month: "Только за полный месяц",
  by_days: "Пропорционально дням периода",
  by_shifts: "Пропорционально сменам",
};

export default function SpecialistPayouts({
  specialistId,
  rules,
  overrides,
  offered,
}: {
  specialistId: string;
  rules: PayoutRules;
  overrides: ServicePayout[];
  offered: OfferedSvc[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [type, setType] = useState<PayoutRules["payout_type"]>(rules.payout_type);
  const [value, setValue] = useState(String(rules.payout_value));
  const [salary, setSalary] = useState(String(rules.salary_month));
  const [mode, setMode] = useState<PayoutRules["salary_mode"]>(rules.salary_mode);
  const [shift, setShift] = useState(String(rules.shift_rate));

  const ovMap = new Map(overrides.map((o) => [o.service_id, o]));

  function save() {
    startTransition(async () => {
      const r = await savePayoutRules(specialistId, {
        payout_type: type,
        payout_value: Number(value) || 0,
        salary_month: Number(salary) || 0,
        salary_mode: mode,
        shift_rate: Number(shift) || 0,
      });
      if (r.ok) {
        toast.success("Правила оплаты сохранены");
        router.refresh();
      } else {
        toast.error(r.error ?? "Не удалось сохранить");
      }
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-neutral-900">Оплата труда</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Начисления складываются: за услуги + за смены + оклад. Ненужное оставьте нулём.
      </p>

      {/* базовое правило за услуги */}
      <div className="mt-5">
        <div className="text-xs font-medium text-neutral-700">Базовое начисление за услугу</div>
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div className="flex rounded-lg border border-neutral-300 p-0.5">
            <button
              onClick={() => setType("percent")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                type === "percent" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              Процент
            </button>
            <button
              onClick={() => setType("fixed")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                type === "fixed" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              Фикс
            </button>
          </div>
          <div>
            <label className="block text-xs text-neutral-500">
              {type === "percent" ? "Процент от стоимости, %" : "Фикс за услугу, ₽"}
            </label>
            <input
              type="number"
              min={0}
              max={type === "percent" ? 100 : undefined}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-40 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-400">
          Считается от цены со скидкой (промо учитывается, баллы и сертификаты — нет).
        </p>
      </div>

      {/* смены и оклад */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs text-neutral-500">Ставка за смену, ₽</label>
          <input
            type="number"
            min={0}
            value={shift}
            onChange={(e) => setShift(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-xs text-neutral-400">Смена = рабочий день по графику.</p>
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Оклад, ₽/мес</label>
          <input
            type="number"
            min={0}
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">Как начислять оклад за период</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as PayoutRules["salary_mode"])}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            {(Object.keys(SALARY_MODE_LABEL) as PayoutRules["salary_mode"][]).map((k) => (
              <option key={k} value={k}>
                {SALARY_MODE_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-5">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>

      {/* переопределения по услугам */}
      {offered.length > 0 && (
        <div className="mt-8 border-t border-neutral-200 pt-6">
          <div className="text-xs font-medium text-neutral-700">Исключения по услугам</div>
          <p className="mt-1 text-xs text-neutral-400">
            Если для услуги нужно другое правило — задайте его здесь. Остальные считаются по базовому.
          </p>

          <div className="mt-3 space-y-2">
            {offered.map((s) => (
              <OverrideRow
                key={s.service_id}
                specialistId={specialistId}
                serviceId={s.service_id}
                name={s.name}
                current={ovMap.get(s.service_id) ?? null}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OverrideRow({
  specialistId,
  serviceId,
  name,
  current,
}: {
  specialistId: string;
  serviceId: string;
  name: string;
  current: ServicePayout | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<"percent" | "fixed">(current?.payout_type ?? "percent");
  const [value, setValue] = useState(String(current?.payout_value ?? ""));

  function save() {
    startTransition(async () => {
      const r = await setServicePayout(specialistId, serviceId, type, Number(value) || 0);
      if (r.ok) {
        toast.success("Исключение сохранено");
        setEditing(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const r = await removeServicePayout(specialistId, serviceId);
      if (r.ok) {
        toast.success("Исключение убрано");
        setEditing(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2">
      <div className="min-w-0 flex-1 truncate text-sm text-neutral-800">{name}</div>

      {!editing ? (
        <>
          {current ? (
            <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              {current.payout_type === "percent"
                ? `${current.payout_value}%`
                : `${new Intl.NumberFormat("ru-RU").format(current.payout_value)} ₽`}
            </span>
          ) : (
            <span className="text-xs text-neutral-400">по базовому правилу</span>
          )}
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900"
          >
            {current ? "Изменить" : "Задать"}
          </button>
          {current && (
            <button
              onClick={remove}
              disabled={pending}
              className="text-xs text-neutral-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
            >
              Убрать
            </button>
          )}
        </>
      ) : (
        <>
          <div className="flex rounded-lg border border-neutral-300 p-0.5">
            <button
              onClick={() => setType("percent")}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                type === "percent" ? "bg-neutral-900 text-white" : "text-neutral-600"
              }`}
            >
              %
            </button>
            <button
              onClick={() => setType("fixed")}
              className={`rounded-md px-2 py-1 text-xs font-medium ${
                type === "fixed" ? "bg-neutral-900 text-white" : "text-neutral-600"
              }`}
            >
              ₽
            </button>
          </div>
          <input
            type="number"
            min={0}
            max={type === "percent" ? 100 : undefined}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 rounded-lg border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
            autoFocus
          />
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-neutral-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Ок
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-neutral-500 hover:text-neutral-800"
          >
            Отмена
          </button>
        </>
      )}
    </div>
  );
}
