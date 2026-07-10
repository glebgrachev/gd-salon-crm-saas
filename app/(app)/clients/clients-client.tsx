"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

export default function ClientsClient({ initial }: { initial: ClientRow[] }) {
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

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Клиенты
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          База клиентов с записями и суммой по каждому.
        </p>
      </header>

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
