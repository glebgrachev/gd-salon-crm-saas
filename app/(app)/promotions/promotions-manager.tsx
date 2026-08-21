"use client";

import { useState, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Upload, Loader2, Tag, Gift, X } from "lucide-react";
import { useShop } from "@/contexts/ShopContext"; // 👈 Добавляем
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { uploadImage } from "@/lib/upload";
import {
  createPromotion,
  updatePromotion,
  deletePromotion,
  type PromotionInput,
} from "./actions";

export type Promotion = {
  id: string;
  kind: "discount" | "gift";
  title: string;
  description: string | null;
  banner_url: string | null;
  discount_type: "percent" | "fixed" | null;
  discount_value: number | null;
  target_category_id: string | null;
  target_service_id: string | null;
  gift_service_id: string | null;
  gift_discount_percent: number | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
};

export type TargetOption = {
  kind: "category" | "service";
  id: string;
  label: string;
};

type Form = {
  id: string | null;
  kind: "discount" | "gift";
  title: string;
  description: string;
  banner_url: string | null;
  target: string;
  discount_type: "" | "percent" | "fixed";
  discount_value: string;
  triggers: string[];
  gift_service_id: string;
  gift_mode: "free" | "percent";
  gift_percent: string;
  valid_from: string;
  valid_to: string;
  is_active: boolean;
};

const EMPTY: Form = {
  id: null,
  kind: "discount",
  title: "",
  description: "",
  banner_url: null,
  target: "",
  discount_type: "",
  discount_value: "",
  triggers: [],
  gift_service_id: "",
  gift_mode: "free",
  gift_percent: "50",
  valid_from: "",
  valid_to: "",
  is_active: true,
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso + "T00:00:00"));
}

export default function PromotionsManager({
  initial,
  categoryOptions,
  serviceOptions,
  triggersByPromo,
  perfByPromo,
}: {
  initial: Promotion[];
  categoryOptions: TargetOption[];
  serviceOptions: TargetOption[];
  triggersByPromo: Record<string, string[]>;
  perfByPromo: Record<string, { count: number; revenue: number }>;
}) {
  const { formatPrice, currency } = useShop(); // 👈 Добавляем валюту
  
  const [form, setForm] = useState<Form | null>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [triggerPick, setTriggerPick] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const svcLabel = (id: string) =>
    serviceOptions.find((o) => o.id === id)?.label ?? "услуга";

  const targetLabel = (p: Promotion) => {
    if (p.target_service_id)
      return serviceOptions.find((o) => o.id === p.target_service_id)?.label;
    if (p.target_category_id)
      return categoryOptions.find((o) => o.id === p.target_category_id)?.label;
    return "Весь салон";
  };

  const discountText = (p: Promotion) => {
    if (!p.discount_type || !p.discount_value) return null;
    return p.discount_type === "percent"
      ? `−${p.discount_value}%`
      : `−${p.discount_value} ${currency?.symbol || '₽'}`; // 👈 Динамический символ
  };

  function openCreate() {
    setForm({ ...EMPTY });
    setTriggerPick("");
  }
  function openEdit(p: Promotion) {
    const pct = p.gift_discount_percent ?? 100;
    setForm({
      id: p.id,
      kind: p.kind,
      title: p.title,
      description: p.description ?? "",
      banner_url: p.banner_url,
      target: p.target_service_id
        ? `svc:${p.target_service_id}`
        : p.target_category_id
          ? `cat:${p.target_category_id}`
          : "",
      discount_type: p.discount_type ?? "",
      discount_value: p.discount_value ? String(p.discount_value) : "",
      triggers: triggersByPromo[p.id] ?? [],
      gift_service_id: p.gift_service_id ?? "",
      gift_mode: pct >= 100 ? "free" : "percent",
      gift_percent: pct >= 100 ? "50" : String(pct),
      valid_from: p.valid_from ?? "",
      valid_to: p.valid_to ?? "",
      is_active: p.is_active,
    });
    setTriggerPick("");
  }

  async function onPickBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "promotions");
      setForm({ ...form, banner_url: url });
    } catch (err) {
      toast.error("Не удалось загрузить: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function addTrigger() {
    if (!form || !triggerPick) return;
    if (form.triggers.includes(triggerPick)) return;
    setForm({ ...form, triggers: [...form.triggers, triggerPick] });
    setTriggerPick("");
  }
  function removeTrigger(id: string) {
    if (!form) return;
    setForm({ ...form, triggers: form.triggers.filter((t) => t !== id) });
  }

  function save() {
    if (!form) return;
    const [kind, tid] = form.target ? form.target.split(":") : ["", ""];
    const payload: PromotionInput = {
      kind: form.kind,
      title: form.title,
      description: form.description,
      banner_url: form.banner_url,
      discount_type: form.discount_type || null,
      discount_value: form.discount_value ? Number(form.discount_value) : null,
      target_category_id: kind === "cat" ? tid : null,
      target_service_id: kind === "svc" ? tid : null,
      gift_service_id: form.gift_service_id || null,
      gift_discount_percent:
        form.gift_mode === "free" ? 100 : Number(form.gift_percent || 0),
      triggers: form.triggers,
      valid_from: form.valid_from || null,
      valid_to: form.valid_to || null,
      is_active: form.is_active,
    };
    startTransition(async () => {
      const r = form.id
        ? await updatePromotion(form.id, payload)
        : await createPromotion(payload);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else {
        toast.success(form.id ? "Сохранено" : "Акция создана");
        setForm(null);
      }
    });
  }

  function remove(p: Promotion) {
    if (!confirm(`Удалить акцию «${p.title}»?`)) return;
    startTransition(async () => {
      const r = await deletePromotion(p.id);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
    });
  }

  const availableTriggers = form
    ? serviceOptions.filter((o) => !form.triggers.includes(o.id))
    : [];

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Акции
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Скидки и комплексы с подарками.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus /> Создать акцию
        </Button>
      </header>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Акций пока нет.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {initial.map((p) => (
            <div
              key={p.id}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white"
            >
              {p.banner_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.banner_url} alt={p.title} className="h-32 w-full object-cover" />
              ) : (
                <div className="flex h-32 w-full items-center justify-center bg-neutral-100 text-neutral-300">
                  {p.kind === "gift" ? <Gift size={28} /> : <Tag size={28} />}
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-neutral-900">{p.title}</h3>
                  {p.kind === "gift" ? (
                    <span className="shrink-0 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                      Комплекс
                    </span>
                  ) : (
                    discountText(p) && (
                      <span className="shrink-0 rounded-md bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                        {discountText(p)}
                      </span>
                    )
                  )}
                </div>

                {p.kind === "gift" ? (
                  <p className="mt-1 text-xs text-neutral-500">
                    {(triggersByPromo[p.id] ?? []).length} усл. в наборе → подарок:{" "}
                    {p.gift_service_id ? svcLabel(p.gift_service_id) : "—"}
                    {p.gift_discount_percent && p.gift_discount_percent < 100
                      ? ` (−${p.gift_discount_percent}%)`
                      : " (бесплатно)"}
                  </p>
                ) : (
                  p.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-neutral-500">
                      {p.description}
                    </p>
                  )
                )}

                <div className="mt-2 text-xs text-neutral-400">
                  {p.kind === "gift" ? "По набору услуг" : targetLabel(p)}
                  {(p.valid_from || p.valid_to) && (
                    <span>
                      {" · "}
                      {fmtDate(p.valid_from) ?? "…"} – {fmtDate(p.valid_to) ?? "…"}
                    </span>
                  )}
                </div>

                {(() => {
                  const perf = perfByPromo[p.id];
                  return perf && perf.count > 0 ? (
                    <div className="mt-2 text-xs text-emerald-600">
                      Сработала {perf.count} раз · {formatPrice(perf.revenue)} {/* 👈 Динамическая цена */}
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-neutral-300">
                      Ещё не применялась
                    </div>
                  );
                })()}

                <div className="mt-3 flex items-center justify-between">
                  {p.is_active ? (
                    <Badge variant="outline" className="border-emerald-200 bg-emerald-100 text-emerald-700">
                      Активна
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-neutral-200 bg-neutral-100 text-neutral-500">
                      Выключена
                    </Badge>
                  )}
                  <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEdit(p)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => remove(p)}>
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Редактировать акцию" : "Новая акция"}</DialogTitle>
          </DialogHeader>

          {form && (
            <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
              {/* тип */}
              <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-sm">
                {(["discount", "gift"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setForm({ ...form, kind: k })}
                    className={`rounded-md px-3 py-1 transition ${
                      form.kind === k
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-500 hover:text-neutral-800"
                    }`}
                  >
                    {k === "discount" ? "Скидка" : "Комплекс / подарок"}
                  </button>
                ))}
              </div>

              {/* баннер */}
              <div>
                {form.banner_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.banner_url} alt="" className="mb-2 h-28 w-full rounded-lg object-cover" />
                ) : null}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickBanner} />
                <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                  {form.banner_url ? "Заменить баннер" : "Загрузить баннер"}
                </Button>
              </div>

              <Field label="Название">
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Например: Комплекс «Образ»" />
              </Field>

              <Field label="Описание">
                <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>

              {form.kind === "discount" ? (
                <>
                  <Field label="Привязка">
                    <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                      <option value="">Весь салон</option>
                      <optgroup label="Категории">
                        {categoryOptions.map((o) => (
                          <option key={o.id} value={`cat:${o.id}`}>{o.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Услуги">
                        {serviceOptions.map((o) => (
                          <option key={o.id} value={`svc:${o.id}`}>{o.label}</option>
                        ))}
                      </optgroup>
                    </select>
                  </Field>
                  <div className="flex gap-2">
                    <Field label="Скидка" className="flex-1">
                      <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as Form["discount_type"] })} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                        <option value="">Без скидки</option>
                        <option value="percent">Процент %</option>
                        <option value="fixed">Фикс. {currency?.symbol || '₽'}</option> {/* 👈 Динамический символ */}
                      </select>
                    </Field>
                    {form.discount_type && (
                      <Field label="Значение" className="w-28">
                        <Input type="number" min={0} value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Field label="Услуги-триггеры (все должны быть в заказе)">
                    <div className="flex gap-2">
                      <select value={triggerPick} onChange={(e) => setTriggerPick(e.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm">
                        <option value="">Выберите услугу…</option>
                        {availableTriggers.map((o) => (
                          <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                      </select>
                      <Button variant="outline" size="sm" onClick={addTrigger} disabled={!triggerPick}>
                        <Plus /> Добавить
                      </Button>
                    </div>
                    {form.triggers.length > 0 && (
                      <div className="mt-2 flex-wrap flex gap-1.5">
                        {form.triggers.map((id) => (
                          <span key={id} className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
                            {svcLabel(id)}
                            <button onClick={() => removeTrigger(id)} className="text-neutral-400 hover:text-neutral-700">
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </Field>

                  <Field label="Подарок">
                    <select value={form.gift_service_id} onChange={(e) => setForm({ ...form, gift_service_id: e.target.value })} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                      <option value="">Выберите услугу-подарок…</option>
                      {serviceOptions.map((o) => (
                        <option key={o.id} value={o.id}>{o.label}</option>
                      ))}
                    </select>
                  </Field>

                  <div className="flex gap-2">
                    <Field label="Условие подарка" className="flex-1">
                      <select value={form.gift_mode} onChange={(e) => setForm({ ...form, gift_mode: e.target.value as "free" | "percent" })} className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm">
                        <option value="free">Бесплатно</option>
                        <option value="percent">Скидка %</option>
                      </select>
                    </Field>
                    {form.gift_mode === "percent" && (
                      <Field label="Процент" className="w-28">
                        <Input type="number" min={1} max={99} value={form.gift_percent} onChange={(e) => setForm({ ...form, gift_percent: e.target.value })} />
                      </Field>
                    )}
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Field label="Действует с" className="flex-1">
                  <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
                </Field>
                <Field label="по" className="flex-1">
                  <Input type="date" value={form.valid_to} onChange={(e) => setForm({ ...form, valid_to: e.target.value })} />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="size-4 rounded border-neutral-300" />
                Активна (показывать в приложении)
              </label>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={pending}>
              Отмена
            </Button>
            <Button onClick={save} disabled={pending || uploading || !form?.title.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <label className="text-xs text-neutral-500">{label}</label>
      {children}
    </div>
  );
}