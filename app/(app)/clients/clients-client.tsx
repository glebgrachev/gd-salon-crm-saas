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

  const query = q.trim().toLowerCase();
  const visible = query
    ? initial.filter((c) =>
        [name(c), c.username, c.phone]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(query)),
      )
    : initial;

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

      <div className="mb-4 max-w-xs">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по имени, @username, телефону"
        />
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
                <TableHead>Контакты</TableHead>
                <TableHead className="text-right">Записей</TableHead>
                <TableHead className="text-right">Потрачено</TableHead>
                <TableHead className="text-right">Регистрация</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((c) => (
                <TableRow
                  key={c.telegram_id}
                  onClick={() => router.push(`/clients/${c.telegram_id}`)}
                  className="cursor-pointer"
                >
                  <TableCell className="font-medium text-neutral-900">
                    {name(c)}
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
                  <TableCell className="text-right text-xs text-neutral-400">
                    {fmtDate(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
