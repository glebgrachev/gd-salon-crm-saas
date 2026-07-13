"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Loader2, Pencil, Trash2, TrendingUp, X, PackagePlus, History, ShoppingCart, Beaker,
} from "lucide-react";
import { uploadImage } from "@/lib/upload";
import {
  saveProduct,
  deleteProduct,
  saveSupplier,
  deleteSupplier,
  createPurchase,
  adjustStock,
  fetchMovements,
  setConsumable,
  removeConsumable,
  sellProduct,
  cancelSale,
  markSalePaid,
  fetchSales,
  type ProductRow,
  type SupplierRow,
  type ProductKind,
  type BaseUnit,
  type PurchaseLine,
  type MovementRow,
  type ConsumableRow,
  type SaleRow,
} from "./actions";
import type { SvcOpt, SpecOpt, ClientOpt } from "./page";

const UNIT: Record<BaseUnit, string> = { pcs: "шт", ml: "мл", g: "г" };

const MOVE_LABEL: Record<string, { text: string; cls: string }> = {
  purchase: { text: "Приход", cls: "bg-emerald-100 text-emerald-700" },
  sale: { text: "Продажа", cls: "bg-blue-100 text-blue-700" },
  consume: { text: "Расход по услуге", cls: "bg-amber-100 text-amber-700" },
  writeoff: { text: "Списание", cls: "bg-red-100 text-red-700" },
  adjust: { text: "Корректировка", cls: "bg-neutral-200 text-neutral-700" },
};

const rub = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("ru-RU").format(Math.round(Number(v))) + " ₽";

const num = (v: number) =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(Number(v));

const dt = (iso: string) =>
  new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

type Tab = "sale" | "supply" | "consumables" | "sales" | "suppliers";

export default function StockClient({
  products,
  suppliers,
  services,
  consumables,
  specialists,
  clients,
}: {
  products: ProductRow[];
  suppliers: SupplierRow[];
  services: SvcOpt[];
  consumables: ConsumableRow[];
  specialists: SpecOpt[];
  clients: ClientOpt[];
}) {
  const [tab, setTab] = useState<Tab>("sale");
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [selling, setSelling] = useState(false);
  const [historyFor, setHistoryFor] = useState<ProductRow | "all" | null>(null);

  const list = products.filter((p) => p.kind === tab);
  const lowCount = products.filter((p) => p.is_low && p.is_active).length;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Склад</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Товары на продажу и расходники. Себестоимость — средневзвешенная по приходам.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setHistoryFor("all")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <History className="h-4 w-4" />
            Движения
          </button>
          <button
            onClick={() => setPurchasing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <PackagePlus className="h-4 w-4" />
            Приход
          </button>
          <button
            onClick={() => setSelling(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <ShoppingCart className="h-4 w-4" />
            Продать
          </button>
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4" />
            Позиция
          </button>
        </div>
      </div>

      {lowCount > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          Заканчивается позиций: <b>{lowCount}</b>. Проверьте остатки ниже порога.
        </div>
      )}

      {/* вкладки */}
      <div className="mt-6 flex gap-2">
        <TabBtn on={tab === "sale"} onClick={() => setTab("sale")}>
          На продажу
        </TabBtn>
        <TabBtn on={tab === "supply"} onClick={() => setTab("supply")}>
          Расходники
        </TabBtn>
        <TabBtn on={tab === "consumables"} onClick={() => setTab("consumables")}>
          Нормы расхода
        </TabBtn>
        <TabBtn on={tab === "sales"} onClick={() => setTab("sales")}>
          Продажи
        </TabBtn>
        <TabBtn on={tab === "suppliers"} onClick={() => setTab("suppliers")}>
          Поставщики
        </TabBtn>
      </div>

      {tab === "suppliers" ? (
        <SuppliersTab suppliers={suppliers} />
      ) : tab === "consumables" ? (
        <ConsumablesTab
          services={services}
          products={products.filter((p) => p.kind === "supply" && p.is_active)}
          consumables={consumables}
        />
      ) : tab === "sales" ? (
        <SalesTab specialists={specialists} />
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Название</th>
                <th className="px-4 py-3 text-right">Остаток</th>
                <th className="px-4 py-3 text-right">Себестоимость</th>
                {tab === "sale" && <th className="px-4 py-3 text-right">Цена</th>}
                {tab === "sale" && <th className="px-4 py-3 text-right">Наценка</th>}
                <th className="px-4 py-3 text-right">Порог</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-neutral-400">
                    Пока пусто. Добавьте позицию.
                  </td>
                </tr>
              )}
              {list.map((p) => (
                <ProductRowView
                  key={p.id}
                  p={p}
                  onEdit={() => setEditing(p)}
                  onHistory={() => setHistoryFor(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductModal
          product={editing === "new" ? null : editing}
          defaultKind={tab === "supply" ? "supply" : "sale"}
          onClose={() => setEditing(null)}
        />
      )}

      {purchasing && (
        <PurchaseModal
          products={products.filter((p) => p.is_active)}
          suppliers={suppliers}
          onClose={() => setPurchasing(false)}
        />
      )}

      {selling && (
        <SellModal
          products={products.filter((p) => p.kind === "sale" && p.is_active && p.stock > 0)}
          specialists={specialists}
          clients={clients}
          onClose={() => setSelling(false)}
        />
      )}

      {historyFor && (
        <MovementsModal
          product={historyFor === "all" ? null : historyFor}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}

function TabBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
        on ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

/* ---------- строка товара ---------- */

function ProductRowView({
  p,
  onEdit,
  onHistory,
}: {
  p: ProductRow;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adjusting, setAdjusting] = useState(false);
  const [newStock, setNewStock] = useState(String(p.stock));

  function doAdjust() {
    startTransition(async () => {
      const r = await adjustStock(p.id, Number(newStock), "Инвентаризация");
      if (r.ok) {
        toast.success("Остаток обновлён");
        setAdjusting(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function remove() {
    if (!confirm(`Удалить «${p.name}»?`)) return;
    startTransition(async () => {
      const r = await deleteProduct(p.id);
      if (r.ok) {
        toast.success(r.archived ? "Позиция скрыта (были движения)" : "Позиция удалена");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  return (
    <tr className={`border-b border-neutral-100 last:border-0 ${!p.is_active ? "opacity-40" : ""}`}>
      <td className="px-4 py-3">
        <div className="font-medium text-neutral-900">{p.name}</div>
        <div className="mt-0.5 text-xs text-neutral-400">
          {p.sku && <span className="mr-2">{p.sku}</span>}
          фасовка: {num(p.pack_size)} {UNIT[p.base_unit]}
          {!p.is_active && <span className="ml-2 text-red-500">скрыт</span>}
        </div>
      </td>

      <td className="px-4 py-3 text-right">
        {adjusting ? (
          <div className="flex items-center justify-end gap-1.5">
            <input
              type="number"
              value={newStock}
              onChange={(e) => setNewStock(e.target.value)}
              className="w-20 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm outline-none focus:border-neutral-900"
              autoFocus
            />
            <button
              onClick={doAdjust}
              disabled={pending}
              className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
            >
              Ок
            </button>
            <button
              onClick={() => setAdjusting(false)}
              className="text-xs text-neutral-500 hover:text-neutral-900"
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setNewStock(String(p.stock));
              setAdjusting(true);
            }}
            title="Инвентаризация"
            className={`font-medium ${
              p.stock < 0
                ? "text-red-600"
                : p.is_low
                ? "text-amber-600"
                : "text-neutral-800"
            } underline decoration-dotted underline-offset-4 hover:text-neutral-900`}
          >
            {num(p.stock)} {UNIT[p.base_unit]}
            {p.base_unit !== "pcs" && p.packs_left != null && (
              <span className="ml-1 text-xs text-neutral-400">
                (~{num(p.packs_left)} уп.)
              </span>
            )}
          </button>
        )}
      </td>

      <td className="px-4 py-3 text-right text-neutral-600">{rub(p.avg_cost)}</td>

      {p.kind === "sale" && (
        <td className="px-4 py-3 text-right font-medium text-neutral-900">{rub(p.price)}</td>
      )}
      {p.kind === "sale" && (
        <td className="px-4 py-3 text-right">
          {p.margin_percent != null ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <TrendingUp className="h-3.5 w-3.5" />
              {p.margin_percent}%
              <span className="text-xs text-neutral-400">({rub(p.profit_per_unit)})</span>
            </span>
          ) : (
            <span className="text-neutral-300">—</span>
          )}
        </td>
      )}

      <td className="px-4 py-3 text-right text-neutral-500">
        {p.low_stock > 0 ? `${num(p.low_stock)} ${UNIT[p.base_unit]}` : "—"}
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={onHistory}
            title="История движений"
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <History className="h-4 w-4" />
          </button>
          <button
            onClick={onEdit}
            title="Изменить"
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-900"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={remove}
            disabled={pending}
            title="Удалить"
            className="rounded-md p-1.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ---------- модалка товара ---------- */

function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto rounded-xl bg-white p-6 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProductModal({
  product,
  defaultKind,
  onClose,
}: {
  product: ProductRow | null;
  defaultKind: ProductKind;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);

  const [kind, setKind] = useState<ProductKind>(product?.kind ?? defaultKind);
  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [unit, setUnit] = useState<BaseUnit>(product?.base_unit ?? "pcs");
  const [packSize, setPackSize] = useState(String(product?.pack_size ?? 1));
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : "");
  const [lowStock, setLowStock] = useState(String(product?.low_stock ?? 0));
  const [desc, setDesc] = useState(product?.description ?? "");
  const [photo, setPhoto] = useState(product?.photo_url ?? null);
  const [active, setActive] = useState(product?.is_active ?? true);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "products");
      setPhoto(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  }

  function save() {
    startTransition(async () => {
      const r = await saveProduct({
        id: product?.id,
        kind,
        name,
        sku,
        base_unit: unit,
        pack_size: Number(packSize) || 1,
        price: kind === "sale" ? Number(price) || null : null,
        low_stock: Number(lowStock) || 0,
        description: desc,
        photo_url: photo,
        is_active: active,
      });
      if (r.ok) {
        toast.success(product ? "Позиция обновлена" : "Позиция добавлена");
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  return (
    <Modal title={product ? "Изменить позицию" : "Новая позиция"} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex rounded-lg border border-neutral-300 p-0.5">
          <button
            onClick={() => setKind("sale")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              kind === "sale" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            На продажу
          </button>
          <button
            onClick={() => setKind("supply")}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition ${
              kind === "supply" ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Расходник
          </button>
        </div>

        <Field label="Название">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "sale" ? "Шампунь восстанавливающий" : "Краска для волос"}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Артикул (необязательно)">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
          <Field label="Единица учёта">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as BaseUnit)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="pcs">штуки</option>
              <option value="ml">миллилитры</option>
              <option value="g">граммы</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`Фасовка (${UNIT[unit]} в упаковке)`}>
            <input
              type="number"
              min={0.01}
              step="any"
              value={packSize}
              onChange={(e) => setPackSize(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
          <Field label={`Порог остатка (${UNIT[unit]})`}>
            <input
              type="number"
              min={0}
              step="any"
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
        </div>

        {kind === "sale" && (
          <>
            <Field label="Цена продажи, ₽">
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </Field>

            <Field label="Описание (видно клиентам)">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </Field>

            <Field label="Фото">
              <div className="flex items-center gap-3">
                {photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="" className="h-16 w-16 rounded-lg object-cover" />
                )}
                <input type="file" accept="image/*" onChange={onPhoto} className="hidden" id="p-photo" />
                <label
                  htmlFor="p-photo"
                  className="cursor-pointer rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {uploading ? "Загружаем…" : photo ? "Заменить" : "Загрузить"}
                </label>
                {photo && (
                  <button
                    onClick={() => setPhoto(null)}
                    className="text-xs text-neutral-400 hover:text-red-600"
                  >
                    Убрать
                  </button>
                )}
              </div>
            </Field>
          </>
        )}

        <label className="flex items-center gap-2 text-xs text-neutral-700">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300"
          />
          Активна
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={pending || uploading}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-500">{label}</label>
      {children}
    </div>
  );
}

/* ---------- приход ---------- */

function PurchaseModal({
  products,
  suppliers,
  onClose,
}: {
  products: ProductRow[];
  suppliers: SupplierRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [supplierId, setSupplierId] = useState<string>(suppliers[0]?.id ?? "");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<(PurchaseLine & { key: number })[]>([
    { key: 1, product_id: "", packs: 1, pack_size: 1, cost_total: 0 },
  ]);

  const total = lines.reduce((s, l) => s + (Number(l.cost_total) || 0), 0);

  function addLine() {
    setLines((p) => [
      ...p,
      { key: Date.now(), product_id: "", packs: 1, pack_size: 1, cost_total: 0 },
    ]);
  }

  function setLine(key: number, patch: Partial<PurchaseLine>) {
    setLines((p) => p.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function onProduct(key: number, id: string) {
    const p = products.find((x) => x.id === id);
    setLine(key, { product_id: id, pack_size: p ? Number(p.pack_size) : 1 });
  }

  function save() {
    startTransition(async () => {
      const r = await createPurchase({
        supplier_id: supplierId || null,
        number,
        invoice_date: date,
        note,
        lines: lines.map(({ key: _key, ...l }) => ({
          ...l,
          packs: Number(l.packs) || 0,
          pack_size: Number(l.pack_size) || 1,
          cost_total: Number(l.cost_total) || 0,
        })),
      });
      if (r.ok) {
        toast.success(`Приход проведён на ${rub(r.total)}`);
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  return (
    <Modal title="Приход по накладной" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Поставщик">
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">— не указан —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Номер накладной">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="ТН-001"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
          <Field label="Дата">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
        </div>

        <div className="rounded-lg border border-neutral-200">
          <div className="grid grid-cols-[1fr_90px_90px_110px_32px] gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
            <span>Позиция</span>
            <span className="text-right">Упаковок</span>
            <span className="text-right">Фасовка</span>
            <span className="text-right">Сумма, ₽</span>
            <span />
          </div>

          {lines.map((l) => {
            const p = products.find((x) => x.id === l.product_id);
            const qty = (Number(l.packs) || 0) * (Number(l.pack_size) || 0);
            return (
              <div
                key={l.key}
                className="grid grid-cols-[1fr_90px_90px_110px_32px] items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-0"
              >
                <div>
                  <select
                    value={l.product_id}
                    onChange={(e) => onProduct(l.key, e.target.value)}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm outline-none focus:border-neutral-900"
                  >
                    <option value="">— выберите —</option>
                    <optgroup label="На продажу">
                      {products
                        .filter((x) => x.kind === "sale")
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Расходники">
                      {products
                        .filter((x) => x.kind === "supply")
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name}
                          </option>
                        ))}
                    </optgroup>
                  </select>
                  {p && qty > 0 && (
                    <div className="mt-1 text-xs text-neutral-400">
                      = {num(qty)} {UNIT[p.base_unit]}
                      {Number(l.cost_total) > 0 && (
                        <> · {rub(Number(l.cost_total) / qty)} за {UNIT[p.base_unit]}</>
                      )}
                    </div>
                  )}
                </div>

                <input
                  type="number"
                  min={0}
                  step="any"
                  value={l.packs}
                  onChange={(e) => setLine(l.key, { packs: Number(e.target.value) })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-900"
                />
                <input
                  type="number"
                  min={0.01}
                  step="any"
                  value={l.pack_size}
                  onChange={(e) => setLine(l.key, { pack_size: Number(e.target.value) })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-900"
                />
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={l.cost_total}
                  onChange={(e) => setLine(l.key, { cost_total: Number(e.target.value) })}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-right text-sm outline-none focus:border-neutral-900"
                />
                <button
                  onClick={() => setLines((p2) => p2.filter((x) => x.key !== l.key))}
                  disabled={lines.length === 1}
                  className="rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}

          <div className="flex items-center justify-between px-3 py-2">
            <button
              onClick={addLine}
              className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Позиция
            </button>
            <div className="text-sm">
              Итого: <b className="text-neutral-900">{rub(total)}</b>
            </div>
          </div>
        </div>

        <Field label="Примечание">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Провести приход
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- движения ---------- */

function MovementsModal({
  product,
  onClose,
}: {
  product: ProductRow | null;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<MovementRow[] | null>(null);
  const productId = product?.id ?? null;

  useEffect(() => {
    fetchMovements(productId).then((r) => {
      if (r.ok) setRows(r.rows);
      else toast.error(r.error);
    });
  }, [productId]);

  return (
    <Modal title={product ? `Движения: ${product.name}` : "Движения по складу"} onClose={onClose} wide>
      {!rows ? (
        <div className="py-8 text-center text-sm text-neutral-400">Загружаем…</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-neutral-400">Движений пока нет.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="py-2">Когда</th>
              {!product && <th className="py-2">Позиция</th>}
              <th className="py-2">Операция</th>
              <th className="py-2 text-right">Кол-во</th>
              <th className="py-2 text-right">Остаток</th>
              <th className="py-2">Примечание</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const lbl = MOVE_LABEL[m.kind] ?? { text: m.kind, cls: "bg-neutral-100" };
              return (
                <tr key={m.id} className="border-b border-neutral-100 last:border-0">
                  <td className="py-2 text-neutral-600">{dt(m.created_at)}</td>
                  {!product && <td className="py-2 text-neutral-800">{m.product_name}</td>}
                  <td className="py-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${lbl.cls}`}>
                      {lbl.text}
                    </span>
                  </td>
                  <td
                    className={`py-2 text-right font-medium ${
                      m.qty_base > 0 ? "text-emerald-700" : "text-neutral-700"
                    }`}
                  >
                    {m.qty_base > 0 ? "+" : ""}
                    {num(m.qty_base)}
                  </td>
                  <td className="py-2 text-right text-neutral-600">{num(m.balance_after)}</td>
                  <td className="py-2 text-xs text-neutral-400">{m.note ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

/* ---------- поставщики ---------- */

function SuppliersTab({ suppliers }: { suppliers: SupplierRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<SupplierRow | "new" | null>(null);

  function remove(id: string, name: string) {
    if (!confirm(`Убрать поставщика «${name}»?`)) return;
    startTransition(async () => {
      const r = await deleteSupplier(id);
      if (r.ok) {
        toast.success("Поставщик убран");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  return (
    <div className="mt-4">
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <Plus className="h-4 w-4" />
          Поставщик
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Название</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Заметка</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-neutral-400">
                  Поставщиков нет.
                </td>
              </tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3 font-medium text-neutral-900">{s.name}</td>
                <td className="px-4 py-3 text-neutral-600">{s.phone ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">{s.email ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-400">{s.note ?? "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setEditing(s)}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(s.id, s.name)}
                      disabled={pending}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <SupplierModal
          supplier={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function SupplierModal({
  supplier,
  onClose,
}: {
  supplier: SupplierRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [note, setNote] = useState(supplier?.note ?? "");

  function save() {
    startTransition(async () => {
      const r = await saveSupplier({ id: supplier?.id, name, phone, email, note });
      if (r.ok) {
        toast.success("Сохранено");
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  return (
    <Modal title={supplier ? "Изменить поставщика" : "Новый поставщик"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Название">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Телефон">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
          <Field label="Email">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </Field>
        </div>
        <Field label="Заметка">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Сохранить
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- нормы расхода ---------- */

function ConsumablesTab({
  services,
  products,
  consumables,
}: {
  services: SvcOpt[];
  products: ProductRow[];
  consumables: ConsumableRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [svcId, setSvcId] = useState(services[0]?.id ?? "");
  const [addProduct, setAddProduct] = useState("");
  const [addQty, setAddQty] = useState("");

  const rows = consumables.filter((c) => c.service_id === svcId);
  const used = new Set(rows.map((r) => r.product_id));
  const free = products.filter((p) => !used.has(p.id));

  function add() {
    if (!addProduct || !addQty) {
      toast.error("Выберите расходник и укажите количество");
      return;
    }
    startTransition(async () => {
      const r = await setConsumable(svcId, addProduct, Number(addQty));
      if (r.ok) {
        toast.success("Норма добавлена");
        setAddProduct("");
        setAddQty("");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function remove(productId: string) {
    startTransition(async () => {
      const r = await removeConsumable(svcId, productId);
      if (r.ok) {
        toast.success("Норма убрана");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  if (services.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-12 text-center text-sm text-neutral-500">
        Сначала добавьте услуги.
      </div>
    );
  }

  const svcName = services.find((s) => s.id === svcId)?.name ?? "";
  const totalCost = rows.reduce((sum, r) => {
    const p = products.find((x) => x.id === r.product_id);
    return sum + (p ? Number(p.avg_cost) * Number(r.qty_base) : 0);
  }, 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <label className="mb-1 block text-xs text-neutral-500">Услуга</label>
        <select
          value={svcId}
          onChange={(e) => setSvcId(e.target.value)}
          className="w-full max-w-md rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-neutral-400">
          Эти расходники спишутся автоматически, когда запись переведут в статус «Оплачено».
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3">
          <Beaker className="h-4 w-4 text-neutral-400" />
          <span className="text-sm font-medium text-neutral-900">
            Расход на услугу «{svcName}»
          </span>
          {totalCost > 0 && (
            <span className="ml-auto text-xs text-neutral-500">
              Себестоимость расходников: <b className="text-neutral-800">{rub(totalCost)}</b>
            </span>
          )}
        </div>

        <table className="w-full text-sm">
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-400">
                  Расходники не заданы — при оплате ничего не спишется.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const p = products.find((x) => x.id === r.product_id);
              if (!p) return null;
              const cost = Number(p.avg_cost) * Number(r.qty_base);
              return (
                <tr key={r.product_id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{p.name}</div>
                    <div className="text-xs text-neutral-400">
                      на складе: {num(p.stock)} {UNIT[p.base_unit]}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="font-medium text-neutral-800">
                      {num(r.qty_base)} {UNIT[p.base_unit]}
                    </span>
                    <div className="text-xs text-neutral-400">≈ {rub(cost)}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => remove(r.product_id)}
                      disabled={pending}
                      className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {free.length > 0 && (
          <div className="flex flex-wrap items-end gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3">
            <select
              value={addProduct}
              onChange={(e) => setAddProduct(e.target.value)}
              className="min-w-52 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              <option value="">— расходник —</option>
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({UNIT[p.base_unit]})
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="any"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              placeholder="Сколько"
              className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
            <button
              onClick={add}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Добавить
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- продажи ---------- */

function SalesTab({ specialists }: { specialists: SpecOpt[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paySpec, setPaySpec] = useState("");

  function markPaid(id: string) {
    startTransition(async () => {
      const r = await markSalePaid(id, paySpec || null);
      if (r.ok) {
        toast.success("Оплачено");
        setPayingId(null);
        setPaySpec("");
        const f = await fetchSales();
        if (f.ok) setRows(f.rows);
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  useEffect(() => {
    fetchSales().then((r) => {
      if (r.ok) setRows(r.rows);
      else toast.error(r.error);
    });
  }, []);

  function cancel(id: string) {
    if (!confirm("Отменить продажу? Товар вернётся на склад.")) return;
    startTransition(async () => {
      const r = await cancelSale(id);
      if (r.ok) {
        toast.success("Продажа отменена, товар возвращён");
        const f = await fetchSales();
        if (f.ok) setRows(f.rows);
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  if (!rows) {
    return <div className="mt-4 py-10 text-center text-sm text-neutral-400">Загружаем…</div>;
  }

  const revenue = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.total, 0);
  const profit = rows
    .filter((r) => r.status === "paid")
    .reduce((s, r) => s + (r.total - r.cost * r.qty), 0);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-xs text-neutral-500">Выручка с товаров</div>
          <div className="mt-1 text-xl font-semibold text-neutral-900">{rub(revenue)}</div>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
          <div className="text-xs text-neutral-500">Прибыль</div>
          <div className="mt-1 text-xl font-semibold text-emerald-700">{rub(profit)}</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Когда</th>
              <th className="px-4 py-3">Товар</th>
              <th className="px-4 py-3">Клиент</th>
              <th className="px-4 py-3">Продал</th>
              <th className="px-4 py-3 text-right">Кол-во</th>
              <th className="px-4 py-3 text-right">Сумма</th>
              <th className="px-4 py-3 text-right">Прибыль</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-neutral-400">
                  Продаж пока нет.
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr
                key={s.id}
                className={`border-b border-neutral-100 last:border-0 ${
                  s.status === "cancelled" ? "opacity-40" : ""
                }`}
              >
                <td className="px-4 py-3 text-neutral-600">{dt(s.paid_at ?? s.created_at)}</td>
                <td className="px-4 py-3">
                  <span className="font-medium text-neutral-900">{s.product_name}</span>
                  {s.status === "reserved" && (
                    <span className="ml-2 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      отложен
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-600">{s.client_name ?? "—"}</td>
                <td className="px-4 py-3 text-neutral-600">{s.specialist_name ?? "—"}</td>
                <td className="px-4 py-3 text-right text-neutral-700">{num(s.qty)}</td>
                <td className="px-4 py-3 text-right font-medium text-neutral-900">{rub(s.total)}</td>
                <td className="px-4 py-3 text-right text-emerald-700">
                  {rub(s.total - s.cost * s.qty)}
                </td>
                <td className="px-4 py-3 text-right">
                  {s.status === "cancelled" ? (
                    <span className="text-xs text-neutral-400">отменена</span>
                  ) : s.status === "reserved" ? (
                    payingId === s.id ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <select
                          value={paySpec}
                          onChange={(e) => setPaySpec(e.target.value)}
                          className="rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
                        >
                          <option value="">— салон —</option>
                          {specialists.map((sp) => (
                            <option key={sp.id} value={sp.id}>
                              {sp.full_name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => markPaid(s.id)}
                          disabled={pending}
                          className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Ок
                        </button>
                        <button
                          onClick={() => setPayingId(null)}
                          className="text-xs text-neutral-500 hover:text-neutral-900"
                        >
                          Отмена
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setPaySpec("");
                            setPayingId(s.id);
                          }}
                          className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-emerald-700"
                        >
                          Оплачено
                        </button>
                        <button
                          onClick={() => cancel(s.id)}
                          disabled={pending}
                          className="text-xs text-neutral-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                        >
                          Отменить
                        </button>
                      </div>
                    )
                  ) : (
                    <button
                      onClick={() => cancel(s.id)}
                      disabled={pending}
                      className="text-xs text-neutral-400 underline underline-offset-2 hover:text-red-600 disabled:opacity-50"
                    >
                      Отменить
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- модалка продажи ---------- */

function SellModal({
  products,
  specialists,
  clients,
  onClose,
}: {
  products: ProductRow[];
  specialists: SpecOpt[];
  clients: ClientOpt[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [clientId, setClientId] = useState<string>("");
  const [specId, setSpecId] = useState<string>("");

  const p = products.find((x) => x.id === productId);
  const total = p && p.price ? Number(p.price) * (Number(qty) || 0) : 0;
  const enough = p ? Number(p.stock) >= (Number(qty) || 0) : false;

  function save() {
    if (!productId) {
      toast.error("Выберите товар");
      return;
    }
    startTransition(async () => {
      const r = await sellProduct({
        product_id: productId,
        qty: Number(qty) || 0,
        client_id: clientId ? Number(clientId) : null,
        specialist_id: specId || null,
        booking_id: null,
      });
      if (r.ok) {
        toast.success(`Продано на ${rub(r.total)}`);
        onClose();
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  if (products.length === 0) {
    return (
      <Modal title="Продажа товара" onClose={onClose}>
        <div className="py-6 text-center text-sm text-neutral-500">
          Нет товаров в наличии.
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Продажа товара" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Товар">
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {rub(x.price)} (остаток {num(x.stock)})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Количество">
            <input
              type="number"
              min={1}
              step="any"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${
                enough ? "border-neutral-300 focus:border-neutral-900" : "border-red-300"
              }`}
            />
            {!enough && p && (
              <p className="mt-1 text-xs text-red-600">На складе только {num(p.stock)}</p>
            )}
          </Field>
          <Field label="Сумма">
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-900">
              {rub(total)}
            </div>
          </Field>
        </div>

        <Field label="Клиент (необязательно)">
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">— без привязки —</option>
            {clients.map((c) => (
              <option key={c.telegram_id} value={c.telegram_id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Продал мастер (для начисления процента)">
          <select
            value={specId}
            onChange={(e) => setSpecId(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          >
            <option value="">— салон —</option>
            {specialists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
            Отмена
          </button>
          <button
            onClick={save}
            disabled={pending || !enough}
            className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Провести продажу
          </button>
        </div>
      </div>
    </Modal>
  );
}
