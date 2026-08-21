"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useShop } from "@/contexts/ShopContext";
import {
  setSpecialistService,
  removeSpecialistService,
} from "./actions";

export type CatalogService = { id: string; name: string; path: string };
export type OfferedService = { service_id: string; price: number };

export default function SpecialistServices({
  specialistId,
  catalog,
  offered,
}: {
  specialistId: string;
  catalog: CatalogService[];
  offered: OfferedService[];
}) {
  const { currency } = useShop(); // 👈 Добавляем валюту
  const [pending, startTransition] = useTransition();
  const [addId, setAddId] = useState("");
  const [addPrice, setAddPrice] = useState("");

  const offeredIds = new Set(offered.map((o) => o.service_id));
  const available = catalog.filter((c) => !offeredIds.has(c.id));
  const byId = new Map(catalog.map((c) => [c.id, c]));

  function savePrice(serviceId: string, raw: string, prev: number) {
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Некорректная цена");
      return;
    }
    if (price === prev) return;
    startTransition(async () => {
      const r = await setSpecialistService(specialistId, serviceId, price);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else toast.success("Цена обновлена");
    });
  }

  function add() {
    const price = Number(addPrice);
    if (!addId) {
      toast.error("Выберите услугу");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Укажите цену");
      return;
    }
    startTransition(async () => {
      const r = await setSpecialistService(specialistId, addId, price);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else {
        toast.success("Услуга добавлена");
        setAddId("");
        setAddPrice("");
      }
    });
  }

  function remove(serviceId: string) {
    startTransition(async () => {
      const r = await removeSpecialistService(specialistId, serviceId);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-8 pb-10">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">
        Услуги и цены
      </h2>

      <div className="rounded-xl border border-neutral-200 bg-white">
        {/* добавление */}
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-100 p-3">
          <select
            value={addId}
            onChange={(e) => setAddId(e.target.value)}
            className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="">
              {available.length ? "Выберите услугу из каталога…" : "Все услуги уже добавлены"}
            </option>
            {available.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
          <Input
            type="number"
            min={0}
            step={50}
            placeholder={`Цена ${currency?.symbol || '₽'}`} // 👈 Динамический placeholder
            value={addPrice}
            onChange={(e) => setAddPrice(e.target.value)}
            className="w-28"
          />
          <Button size="sm" onClick={add} disabled={pending || !addId}>
            <Plus /> Добавить
          </Button>
        </div>

        {offered.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-neutral-400">
            Услуги не привязаны. Добавь из каталога с ценой.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {offered.map((o) => {
              const svc = byId.get(o.service_id);
              return (
                <li
                  key={o.service_id}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-neutral-800">
                      {svc?.name ?? "Услуга"}
                    </div>
                    {svc?.path && (
                      <div className="truncate text-xs text-neutral-400">
                        {svc.path}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      step={50}
                      defaultValue={o.price}
                      key={`${o.service_id}-${o.price}`}
                      onBlur={(e) =>
                        savePrice(o.service_id, e.target.value, o.price)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                      }}
                      className="w-24 text-right"
                    />
                    <span className="text-neutral-400">
                      {currency?.symbol || '₽'} {/* 👈 Динамический символ */}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(o.service_id)}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-2 text-xs text-neutral-400">
        Эти цены формируют диапазон «от/до» в карточке мастера в приложении.
      </p>
    </section>
  );
}