"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { fmtPrice } from "@/lib/bookings";
import { AlertTriangle, ArrowRight } from "lucide-react";

export type ClientRow = {
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  created_at: string;
  bookings: number;
  spent: number;
  segment: string;
  last_visit: string | null;
  days_since_last: number | null;
  paid_visits: number;
};

export const SEGMENTS: Record<string, { label: string; cls: string }> = {
  no_visits: { label: "Без визитов", cls: "bg-neutral-100 text-neutral-500" },
  new: { label: "Новый", cls: "bg-emerald-100 text-emerald-700" },
  regular: { label: "Постоянный", cls: "bg-blue-100 text-blue-700" },
  sleeping: { label: "Спящий", cls: "bg-amber-100 text-amber-700" },
  lost: { label: "Потерянный", cls: "bg-red-100 text-red-600" },
};

function name(c: ClientRow) {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || (c.username ? "@" + c.username : "Без имени");
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

// ===== ФУНКЦИЯ ДЛЯ СКЛОНЕНИЯ =====
function pluralizeMe(count: number): string {
  if (count === 0) return "мест";
  if (count === 1) return "место";
  if (count >= 2 && count <= 4) return "места";
  return "мест";
}

export default function ClientsClient({ 
  initial,
  shopId,
  clientLimit,
  clientsCount,
}: { 
  initial: ClientRow[];
  shopId: number;
  clientLimit: number;
  clientsCount: number;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<string>("all");

  const query = q.trim().toLowerCase();
  const visible = initial.filter((c) => {
    if (seg !== "all" && c.segment !== seg) return false;
    if (!query) return true;
    return [name(c), c.username, c.phone]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(query));
  });

  const counts = initial.reduce<Record<string, number>>((acc, c) => {
    acc[c.segment] = (acc[c.segment] ?? 0) + 1;
    return acc;
  }, {});

  const isLimitReached = clientLimit !== -1 && clientsCount >= clientLimit;
  const isNearLimit = clientLimit !== -1 && clientsCount >= Math.floor(clientLimit * 0.7) && !isLimitReached;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Клиенты
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            База клиентов с записями и суммой по каждому.
          </p>
          
          {/* Индикатор лимита */}
          {clientLimit !== -1 && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-neutral-400">
                Клиентов: {clientsCount}/{clientLimit}
              </span>
              {isNearLimit && !isLimitReached && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  Приближаетесь к лимиту
                </span>
              )}
              {isLimitReached && (
                <span className="flex items-center gap-1 text-red-600">
                  <AlertTriangle className="h-3 w-3" />
                  Лимит достигнут
                </span>
              )}
            </div>
          )}
          {clientLimit === -1 && (
            <p className="mt-1 text-xs text-emerald-600">
              Безлимитный тариф
            </p>
          )}
        </div>
      </header>

      {/* 🔥 ПРЕДУПРЕЖДЕНИЕ О ЛИМИТЕ С КНОПКОЙ "ВЫБРАТЬ ТАРИФ" */}
      {isLimitReached && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-red-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Лимит клиентов достигнут!</div>
              <div className="text-red-600">Вы не можете добавлять новых клиентов на текущем тарифе.</div>
            </div>
          </div>
          <Link 
            href="/tariffs"
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition"
          >
            Выбрать тариф
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      {isNearLimit && !isLimitReached && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-amber-700">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <div>
              <div className="font-semibold">Осталось {clientLimit - clientsCount} {pluralizeMe(clientLimit - clientsCount)}</div>
              <div className="text-amber-600">
                {clientLimit - clientsCount <= 10 
                  ? "Скоро достигнете лимита. Рекомендуем обновить тариф." 
                  : "При достижении лимита вы не сможете добавлять новых клиентов."}
              </div>
            </div>
          </div>
          <Link 
            href="/tariffs"
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition"
          >
            Выбрать тариф
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="max-w-xs flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по имени, @username, телефону"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSeg("all")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              seg === "all" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Все · {initial.length}
          </button>
          {(["new", "regular", "sleeping", "lost", "no_visits"] as const).map((k) => {
            const s = SEGMENTS[k];
            const active = seg === k;
            return (
              <button
                key={k}
                onClick={() => setSeg(k)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                  active ? "ring-2 ring-neutral-900 " + s.cls : s.cls + " opacity-70 hover:opacity-100"
                }`}
              >
                {s.label} · {counts[k] ?? 0}
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          {initial.length === 0
            ? "Клиентов пока нет. Они появятся после первых записей из приложения."
            : "Ничего не найдено."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Имя</TableHead>
                <TableHead>Сегмент</TableHead>
                <TableHead>Контакты</TableHead>
                <TableHead className="text-right">Записей</TableHead>
                <TableHead className="text-right">Потрачено</TableHead>
                <TableHead className="text-right">Последний визит</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((c) => {
                const s = SEGMENTS[c.segment] ?? SEGMENTS.no_visits;
                return (
                  <TableRow
                    key={c.telegram_id}
                    onClick={() => router.push(`/clients/${c.telegram_id}`)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium text-neutral-900">
                      {name(c)}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-neutral-600">
                      {c.username && (
                        <span className="text-neutral-500">@{c.username}</span>
                      )}
                      {c.phone && (
                        <span className="block text-xs text-neutral-400">
                          {c.phone}
                        </span>
                      )}
                      {!c.username && !c.phone && "—"}
                    </TableCell>
                    <TableCell className="text-right text-neutral-700">
                      {c.bookings}
                    </TableCell>
                    <TableCell className="text-right font-medium text-neutral-900">
                      {fmtPrice(c.spent)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-neutral-500">
                      {c.last_visit ? (
                        <>
                          {fmtDate(c.last_visit)}
                          {c.days_since_last != null && (
                            <span className="block text-neutral-400">{c.days_since_last} дн. назад</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}