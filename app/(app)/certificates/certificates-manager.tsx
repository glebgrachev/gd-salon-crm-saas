"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Check } from "lucide-react";
import { issueCertificate, setCertificateDisabled } from "./actions";

type Row = {
  id: string;
  code: string;
  amount: number;
  balance: number;
  status: string;
  activated_at: string | null;
  activated_name: string | null;
  note: string | null;
  created_at: string;
};
type Stats = { total: number; active: number; issuedNominal: number; remaining: number };

const STATUS: Record<string, { label: string; cls: string }> = {
  issued: { label: "Выпущен", cls: "bg-blue-100 text-blue-700" },
  active: { label: "Активирован", cls: "bg-emerald-100 text-emerald-700" },
  used: { label: "Использован", cls: "bg-neutral-100 text-neutral-500" },
  disabled: { label: "Отключён", cls: "bg-red-100 text-red-600" },
};

function fmtRub(n: number) {
  return new Intl.NumberFormat("ru-RU").format(n) + " ₽";
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(iso));
}

export default function CertificatesManager({ rows, stats }: { rows: Row[]; stats: Stats }) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function copy(code: string) {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    });
  }

  function issue() {
    startTransition(async () => {
      const r = await issueCertificate({ amount: Number(amount.replace(",", ".")), note });
      if (r.ok && r.code) {
        setIssued(r.code);
        setAmount("");
        setNote("");
        toast.success("Сертификат выпущен: " + r.code);
      } else {
        toast.error(r.error ?? "Не удалось выпустить");
      }
    });
  }

  function toggle(id: string, disabled: boolean) {
    startTransition(async () => {
      const r = await setCertificateDisabled(id, disabled);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else toast.success(disabled ? "Сертификат отключён" : "Сертификат включён");
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Сертификаты</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Подарочные сертификаты на сумму. Клиент активирует код в приложении и оплачивает им услуги.
      </p>

      <div className="mt-6 grid grid-cols-4 gap-3">
        <Stat label="Всего сертификатов" value={String(stats.total)} />
        <Stat label="Активных" value={String(stats.active)} />
        <Stat label="Выпущено на сумму" value={fmtRub(stats.issuedNominal)} />
        <Stat label="Остаток по активным" value={fmtRub(stats.remaining)} />
      </div>

      {/* выпуск */}
      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
        <div className="text-sm font-medium text-neutral-800">Выпустить сертификат</div>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-neutral-500">Номинал, ₽</label>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="3000"
              className="mt-1 w-32 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-neutral-500">Комментарий (необязательно)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Например: продан 10.07"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <button
            onClick={issue}
            disabled={pending}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending ? "Выпускаем…" : "Выпустить"}
          </button>
        </div>

        {issued && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-sm text-emerald-700">Код сертификата:</div>
            <div className="font-mono text-lg font-semibold tracking-wider text-emerald-800">{issued}</div>
            <button
              onClick={() => copy(issued)}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            >
              {copied === issued ? <Check size={14} /> : <Copy size={14} />}
              {copied === issued ? "Скопировано" : "Копировать"}
            </button>
          </div>
        )}
      </div>

      {/* список */}
      <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Код</th>
              <th className="px-4 py-3">Номинал</th>
              <th className="px-4 py-3">Остаток</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3">Активировал</th>
              <th className="px-4 py-3">Выпущен</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Пока нет сертификатов. Выпустите первый выше.
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const st = STATUS[c.status] ?? STATUS.issued;
              return (
                <tr key={c.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => copy(c.code)}
                      className="inline-flex items-center gap-1 font-mono font-medium text-neutral-900 hover:text-neutral-600"
                      title="Скопировать"
                    >
                      {c.code}
                      {copied === c.code ? <Check size={13} /> : <Copy size={13} className="opacity-40" />}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{fmtRub(c.amount)}</td>
                  <td className="px-4 py-3 text-neutral-700">{fmtRub(c.balance)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">
                    {c.activated_name ?? "—"}
                    {c.activated_at && <span className="block text-xs text-neutral-400">{fmtDate(c.activated_at)}</span>}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{fmtDate(c.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.status !== "used" &&
                      (c.status === "disabled" ? (
                        <button onClick={() => toggle(c.id, false)} className="text-xs font-medium text-emerald-600 hover:underline">
                          Включить
                        </button>
                      ) : (
                        <button onClick={() => toggle(c.id, true)} className="text-xs font-medium text-red-500 hover:underline">
                          Отключить
                        </button>
                      ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
