"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { updateRetentionSettings } from "./actions";

const SEG: Record<string, { label: string; cls: string }> = {
  no_visits: { label: "Без визитов", cls: "bg-neutral-100 text-neutral-500" },
  new: { label: "Новые", cls: "bg-emerald-100 text-emerald-700" },
  regular: { label: "Постоянные", cls: "bg-blue-100 text-blue-700" },
  sleeping: { label: "Спящие", cls: "bg-amber-100 text-amber-700" },
  lost: { label: "Потерянные", cls: "bg-red-100 text-red-600" },
};

type AwayRow = {
  client_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  visits: number;
  last_visit: string | null;
  days_since_last: number | null;
  segment: string;
  retention_notified_at: string | null;
};

function name(r: { first_name: string | null; last_name: string | null; username: string | null }) {
  const full = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return full || (r.username ? "@" + r.username : "Без имени");
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso));
}

export default function RetentionClient({
  counts,
  total,
  settings,
  away,
}: {
  counts: Record<string, number>;
  total: number;
  settings: { new_days: number; regular_days: number; lost_days: number };
  away: AwayRow[];
}) {
  const [n, setN] = useState(String(settings.new_days));
  const [r, setR] = useState(String(settings.regular_days));
  const [l, setL] = useState(String(settings.lost_days));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateRetentionSettings({
        new_days: Number(n),
        regular_days: Number(r),
        lost_days: Number(l),
      });
      if (res.ok) toast.success("Пороги обновлены");
      else toast.error(res.error ?? "Не удалось сохранить");
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Возвращаемость</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Сегменты клиентов по последнему оплаченному визиту. Список «давно не были» — кому пора написать.
      </p>

      {/* сводка */}
      <div className="mt-6 grid grid-cols-5 gap-3">
        {(["new", "regular", "sleeping", "lost", "no_visits"] as const).map((k) => {
          const s = SEG[k];
          return (
            <div key={k} className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-xs text-neutral-500">{s.label}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <div className="text-xl font-semibold text-neutral-900">{counts[k] ?? 0}</div>
                <div className="text-xs text-neutral-400">
                  {total > 0 ? Math.round(((counts[k] ?? 0) / total) * 100) : 0}%
                </div>
              </div>
              <span className={`mt-2 inline-flex rounded-md px-1.5 py-0.5 text-xs font-medium ${s.cls}`}>
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* настройки порогов */}
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
        <div className="text-sm font-medium text-neutral-800">Пороги сегментов (дни)</div>
        <div className="mt-3 grid grid-cols-3 gap-4 max-w-2xl">
          <Field
            label="Новый — не позже, дней"
            hint="Клиент с одним оплаченным визитом за этот период — «Новый»."
            value={n}
            onChange={setN}
          />
          <Field
            label="Постоянный — не позже, дней"
            hint="Приходили не позже этого срока — «Постоянные». Дольше — «Спящие»."
            value={r}
            onChange={setR}
          />
          <Field
            label="Потерянный — после, дней"
            hint="Не приходили дольше этого срока — «Потерянные»."
            value={l}
            onChange={setL}
          />
        </div>
        <div className="mt-4">
          <button
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>

      {/* список «давно не были» */}
      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <div className="text-sm font-medium text-neutral-800">Давно не были</div>
          <div className="text-xs text-neutral-400">
            {away.length > 0 ? `${away.length} клиентов` : "пока никого"}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Сегмент</th>
                <th className="px-4 py-3">Визитов</th>
                <th className="px-4 py-3">Последний визит</th>
                <th className="px-4 py-3">Напоминание</th>
              </tr>
            </thead>
            <tbody>
              {away.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                    Все клиенты приходили недавно 👍
                  </td>
                </tr>
              )}
              {away.map((c) => {
                const s = SEG[c.segment] ?? SEG.sleeping;
                return (
                  <tr key={c.client_id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.client_id}`} className="font-medium text-neutral-900 hover:underline">
                        {name(c)}
                      </Link>
                      {c.username && <span className="ml-2 text-xs text-neutral-400">@{c.username}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{c.visits}</td>
                    <td className="px-4 py-3">
                      {c.last_visit ? (
                        <>
                          <div className="text-neutral-800">{fmtDate(c.last_visit)}</div>
                          <div className="text-xs text-neutral-400">{c.days_since_last} дн. назад</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {c.retention_notified_at ? (
                        <span className="text-emerald-600">отправлено {fmtDate(c.retention_notified_at)}</span>
                      ) : (
                        <span className="text-neutral-400">ещё не отправлялось</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs text-neutral-500">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "-" || e.key === "e" || e.key === "+") e.preventDefault();
        }}
        className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
      />
      <p className="mt-1 text-xs text-neutral-400">{hint}</p>
    </div>
  );
}
