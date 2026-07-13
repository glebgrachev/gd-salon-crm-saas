"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Clock, Trash2, Users } from "lucide-react";
import { useRealtime } from "@/lib/use-realtime";
import { removeFromWaitlist } from "./actions";

export type WaitRow = {
  id: string;
  status: "waiting" | "offered";
  kind: "slot" | "day";
  target_date: string;
  slot_start: string | null;
  offered_slot: string | null;
  offer_expires_at: string | null;
  offers_sent: number;
  created_at: string;
  client_id: number;
  client_name: string;
  client_username: string | null;
  service_name: string;
  specialist_name: string;
  others_waiting: number;
};

const dt = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const dateOnly = (d: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "short",
  }).format(new Date(`${d}T12:00:00`));

const ago = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins} мин назад`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} ч назад`;
  return `${Math.floor(h / 24)} дн назад`;
};

export default function WaitlistClient({ rows }: { rows: WaitRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(Date.now());

  // очередь живёт: предложения раздаются кроном, таймеры истекают
  useRealtime(["waitlist", "bookings"]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function remove(id: string, who: string) {
    if (!confirm(`Убрать ${who} из очереди?`)) return;
    startTransition(async () => {
      const r = await removeFromWaitlist(id);
      if (r.ok) {
        toast.success("Убрали из очереди");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  const offered = rows.filter((r) => r.status === "offered");
  const waiting = rows.filter((r) => r.status === "waiting");

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Лист ожидания</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Клиенты, которые ждут освободившееся время. Когда запись отменяют, первый в очереди
        получает предложение и 30 минут на решение.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Users className="h-3.5 w-3.5" />В очереди
          </div>
          <div className="mt-1 text-xl font-semibold text-neutral-900">{waiting.length}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-xs text-amber-700">
            <Bell className="h-3.5 w-3.5" />
            Ждут ответа
          </div>
          <div className="mt-1 text-xl font-semibold text-amber-800">{offered.length}</div>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Очередь пуста. Клиенты встают в неё, нажимая на занятое время в приложении.
        </div>
      )}

      {offered.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-neutral-900">
            Предложение отправлено
          </h2>
          <div className="mt-3 space-y-2">
            {offered.map((r) => {
              const left = r.offer_expires_at
                ? Math.max(0, new Date(r.offer_expires_at).getTime() - now)
                : 0;
              const mm = Math.floor(left / 60000);
              const ss = Math.floor((left % 60000) / 1000);

              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <div className="flex-1 min-w-52">
                    <div className="font-medium text-neutral-900">{r.client_name}</div>
                    <div className="mt-0.5 text-xs text-neutral-600">
                      {r.service_name} · {r.specialist_name}
                    </div>
                    {r.offered_slot && (
                      <div className="mt-0.5 text-xs font-medium text-amber-800">
                        Предложено: {dt(r.offered_slot)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-amber-800">
                    <Clock className="h-4 w-4" />
                    {left > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : "истекло"}
                  </div>

                  {r.offers_sent > 1 && (
                    <span className="rounded-md bg-white px-2 py-0.5 text-xs text-neutral-500">
                      попытка {r.offers_sent}
                    </span>
                  )}

                  <button
                    onClick={() => remove(r.id, r.client_name)}
                    disabled={pending}
                    className="rounded-md p-1.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {waiting.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-semibold text-neutral-900">Ожидают</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Услуга и мастер</th>
                  <th className="px-4 py-3">Чего ждёт</th>
                  <th className="px-4 py-3">В очереди</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {waiting.map((r) => (
                  <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-neutral-900">{r.client_name}</div>
                      {r.client_username && (
                        <a
                          href={`https://t.me/${r.client_username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-neutral-400 hover:text-neutral-900"
                        >
                          @{r.client_username}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">
                      {r.service_name}
                      <div className="text-xs text-neutral-400">{r.specialist_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      {r.kind === "slot" && r.slot_start ? (
                        <span className="text-neutral-800">{dt(r.slot_start)}</span>
                      ) : (
                        <span className="text-neutral-800">
                          {dateOnly(r.target_date)}
                          <span className="text-neutral-400"> · любое время</span>
                        </span>
                      )}
                      {r.others_waiting > 0 && (
                        <div className="text-xs text-neutral-400">
                          ещё {r.others_waiting} в очереди на это же
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{ago(r.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => remove(r.id, r.client_name)}
                        disabled={pending}
                        className="rounded-md p-1.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
