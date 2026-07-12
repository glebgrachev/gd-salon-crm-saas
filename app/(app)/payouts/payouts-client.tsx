"use client";

import { useState, useTransition, Fragment } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { fetchPayoutDetail, type DetailRow } from "./actions";

export type PayoutRow = {
  specialist_id: string;
  full_name: string;
  services_count: number;
  revenue: number;
  services_payout: number;
  shifts: number;
  shifts_payout: number;
  salary_payout: number;
  total_payout: number;
  salon_share: number;
};

const rub = (v: number | null | undefined) =>
  new Intl.NumberFormat("ru-RU").format(Math.round(Number(v ?? 0))) + " ₽";

const dt = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

function iso(d: Date) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

function presets() {
  const now = new Date();
  const thisMonthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const prevMonthFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthTo = new Date(now.getFullYear(), now.getMonth(), 0);
  const dow = (now.getDay() + 6) % 7; // пн = 0
  const weekFrom = new Date(now);
  weekFrom.setDate(now.getDate() - dow);
  const weekTo = new Date(weekFrom);
  weekTo.setDate(weekFrom.getDate() + 6);

  return [
    { label: "Текущий месяц", from: iso(thisMonthFrom), to: iso(thisMonthTo) },
    { label: "Прошлый месяц", from: iso(prevMonthFrom), to: iso(prevMonthTo) },
    { label: "Текущая неделя", from: iso(weekFrom), to: iso(weekTo) },
  ];
}

export default function PayoutsClient({
  from,
  to,
  rows,
  error,
}: {
  from: string;
  to: string;
  rows: PayoutRow[];
  error: string | null;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [, startTransition] = useTransition();

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailRow[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  function apply(nf = f, nt = t) {
    if (nf > nt) {
      toast.error("Дата начала позже даты конца");
      return;
    }
    startTransition(() => {
      router.push(`/payouts?from=${nf}&to=${nt}`);
    });
  }

  async function toggleDetail(row: PayoutRow) {
    if (openId === row.specialist_id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(row.specialist_id);
    setDetail(null);
    setDetailLoading(true);
    const r = await fetchPayoutDetail(row.specialist_id, from, to);
    setDetailLoading(false);
    if (r.ok) setDetail(r.rows);
    else toast.error(r.error);
  }

  const totals = rows.reduce(
    (acc, r) => ({
      revenue: acc.revenue + Number(r.revenue),
      payout: acc.payout + Number(r.total_payout),
      salon: acc.salon + Number(r.salon_share),
    }),
    { revenue: 0, payout: 0, salon: 0 },
  );

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Зарплаты</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Начисления по мастерам: услуги (только оплаченные) + смены по графику + оклад.
      </p>

      {/* период */}
      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div>
          <label className="block text-xs text-neutral-500">С</label>
          <input
            type="date"
            value={f}
            onChange={(e) => setF(e.target.value)}
            className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-500">По</label>
          <input
            type="date"
            value={t}
            onChange={(e) => setT(e.target.value)}
            className="mt-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <button
          onClick={() => apply()}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Показать
        </button>

        <div className="ml-auto flex flex-wrap gap-1.5">
          {presets().map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setF(p.from);
                setT(p.to);
                apply(p.from, p.to);
              }}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                from === p.from && to === p.to
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* сводка */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Card label="Выручка за период" value={rub(totals.revenue)} />
        <Card label="Начислено мастерам" value={rub(totals.payout)} accent="text-neutral-900" />
        <Card label="Остаётся салону" value={rub(totals.salon)} accent="text-emerald-700" />
      </div>

      {/* таблица */}
      <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Мастер</th>
              <th className="px-4 py-3 text-right">Услуг</th>
              <th className="px-4 py-3 text-right">Выручка</th>
              <th className="px-4 py-3 text-right">За услуги</th>
              <th className="px-4 py-3 text-right">Смен</th>
              <th className="px-4 py-3 text-right">За смены</th>
              <th className="px-4 py-3 text-right">Оклад</th>
              <th className="px-4 py-3 text-right">Итого</th>
              <th className="px-4 py-3 text-right">Салону</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                  Нет данных за выбранный период.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Fragment key={r.specialist_id}>
                <tr
                  onClick={() => toggleDetail(r)}
                  className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                >
                  <td className="px-4 py-3 font-medium text-neutral-900">
                    {r.full_name}
                    <span className="ml-2 text-xs text-neutral-400">
                      {openId === r.specialist_id ? "▾" : "▸"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-700">{r.services_count}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{rub(r.revenue)}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{rub(r.services_payout)}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{r.shifts}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{rub(r.shifts_payout)}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{rub(r.salary_payout)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-neutral-900">
                    {rub(r.total_payout)}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700">{rub(r.salon_share)}</td>
                </tr>

                {openId === r.specialist_id && (
                  <tr className="border-b border-neutral-100 bg-neutral-50/60">
                    <td colSpan={9} className="px-4 py-3">
                      {detailLoading && <div className="text-xs text-neutral-400">Загружаем…</div>}
                      {detail && detail.length === 0 && (
                        <div className="text-xs text-neutral-400">Нет оплаченных услуг за период.</div>
                      )}
                      {detail && detail.length > 0 && (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-neutral-400">
                              <th className="py-1.5">Когда</th>
                              <th className="py-1.5">Услуга</th>
                              <th className="py-1.5">Клиент</th>
                              <th className="py-1.5 text-right">Сумма</th>
                              <th className="py-1.5 text-right">Правило</th>
                              <th className="py-1.5 text-right">Начислено</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.map((d) => (
                              <tr key={d.booking_id} className="border-t border-neutral-200/70">
                                <td className="py-1.5 text-neutral-600">{dt(d.starts_at)}</td>
                                <td className="py-1.5 text-neutral-800">{d.service_name}</td>
                                <td className="py-1.5 text-neutral-600">{d.client_name}</td>
                                <td className="py-1.5 text-right text-neutral-700">{rub(d.amount)}</td>
                                <td className="py-1.5 text-right text-neutral-500">
                                  {d.payout_type === "percent"
                                    ? `${d.payout_value}%`
                                    : `фикс ${rub(d.payout_value)}`}
                                </td>
                                <td className="py-1.5 text-right font-medium text-neutral-900">
                                  {rub(d.payout)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? "text-neutral-900"}`}>{value}</div>
    </div>
  );
}
