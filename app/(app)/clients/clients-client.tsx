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
import { AlertTriangle, ArrowRight, User, UserRound, Plus } from "lucide-react";
import { AddClientModal } from "@/components/clients/AddClientModal";

export type ClientRow = {
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  is_guest: boolean;
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

type Currency = {
  id: number;
  code: string;
  symbol: string;
  name: string;
};

function name(c: ClientRow) {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (c.username) return "@" + c.username;
  if (c.phone) return `Гость: ${c.phone}`;
  return "Без имени";
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

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
  currency,
}: { 
  initial: ClientRow[];
  shopId: number;
  clientLimit: number;
  clientsCount: number;
  currency: Currency | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<string>("all");
  const [type, setType] = useState<"all" | "telegram" | "guest">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  const formatPrice = (amount: number) => {
    if (amount == null) return "—";
    if (!currency) return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
    return `${Math.round(amount).toLocaleString('ru-RU')} ${currency.symbol}`;
  };

  const query = q.trim().toLowerCase();
  const visible = initial.filter((c) => {
    // Фильтр по типу
    if (type === "telegram" && c.is_guest) return false;
    if (type === "guest" && !c.is_guest) return false;
    
    // Фильтр по сегменту
    if (seg !== "all" && c.segment !== seg) return false;
    
    // Поиск
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

  const handleClientAdded = () => {
    router.refresh();
  };

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
          
          {clientLimit !== -1 && (
            <div className="mt-1 flex items-center gap-2 text-xs">
              <span className="text-neutral-400">
                Клиентов: {clientsCount}/{clientLimit}
              </span>
              {isNearLimit && !isLimitReached && (
                <span className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  Осталось {clientLimit - clientsCount} {pluralizeMe(clientLimit - clientsCount)}
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
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition"
          >
            <Plus className="h-4 w-4" />
            Добавить клиента
          </button>
          
          {(isNearLimit || isLimitReached) && (
            <Link 
              href="/tariffs"
              className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700 transition"
            >
              Выбрать тариф
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </header>

      <div className="mb-4 flex flex-col gap-3">
        {/* Поиск */}
        <div className="max-w-xs">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск по имени, @username, телефону"
          />
        </div>

        {/* Ряд 1: Фильтр по типу клиента */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setType("all")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              type === "all" 
                ? "bg-neutral-900 text-white" 
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Все · {initial.length}
          </button>
          <button
            onClick={() => setType("telegram")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              type === "telegram" 
                ? "bg-blue-600 text-white" 
                : "bg-blue-50 text-blue-600 hover:bg-blue-100"
            }`}
          >
            <User className="mr-1 inline h-3 w-3" />
            Telegram · {initial.filter(c => !c.is_guest).length}
          </button>
          <button
            onClick={() => setType("guest")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              type === "guest" 
                ? "bg-neutral-600 text-white" 
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            <UserRound className="mr-1 inline h-3 w-3" />
            Гости · {initial.filter(c => c.is_guest).length}
          </button>
        </div>

        {/* Ряд 2: Фильтр по сегментам */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setSeg("all")}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              seg === "all" ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            Все сегменты · {initial.length}
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
                <TableHead>Клиент</TableHead>
                <TableHead>Тип</TableHead>
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
                      {c.is_guest ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
                          <UserRound className="h-3 w-3" />
                          Гость
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          <User className="h-3 w-3" />
                          Telegram
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${s.cls}`}>
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-neutral-600">
                      {c.is_guest ? (
                        <span className="block text-sm text-neutral-600">
                          {c.phone || "—"}
                        </span>
                      ) : (
                        <>
                          {c.username && (
                            <span className="text-neutral-500">@{c.username}</span>
                          )}
                          {c.phone && (
                            <span className="block text-xs text-neutral-400">
                              {c.phone}
                            </span>
                          )}
                          {!c.username && !c.phone && "—"}
                        </>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-neutral-700">
                      {c.bookings}
                    </TableCell>
                    <TableCell className="text-right font-medium text-neutral-900">
                      {formatPrice(c.spent)}
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

      <AddClientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleClientAdded}
        shopId={shopId}
      />
    </div>
  );
}