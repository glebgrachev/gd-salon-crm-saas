"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Plus,
  Pencil,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createCategory,
  renameCategory,
  deleteCategory,
  createService,
  updateService,
  deleteService,
} from "./actions";

export type Category = {
  id: string;
  parent_id: string | null;
  name: string;
  level: number;
  sort_order: number | null;
};
export type Service = {
  id: string;
  category_id: string;
  name: string;
  duration_min: number;
};

type DialogState =
  | { kind: "cat-create"; parentId: string | null; parentName?: string }
  | { kind: "cat-edit"; id: string; name: string }
  | { kind: "svc-create"; categoryId: string; categoryName: string }
  | { kind: "svc-edit"; id: string; name: string; duration: number }
  | null;

export default function ServicesManager({
  categories,
  services,
}: {
  categories: Category[];
  services: Service[];
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const childrenOf = (parentId: string | null) =>
    categories.filter((c) => c.parent_id === parentId);
  const servicesOf = (categoryId: string) =>
    services.filter((s) => s.category_id === categoryId);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else setDialog(null);
    });
  }

  function onDeleteCategory(c: Category) {
    if (
      !confirm(
        `Удалить «${c.name}»? Вместе с ней удалятся все подкатегории и услуги внутри.`,
      )
    )
      return;
    run(() => deleteCategory(c.id));
  }

  function onDeleteService(s: Service) {
    if (!confirm(`Удалить услугу «${s.name}»?`)) return;
    run(() => deleteService(s.id));
  }

  const roots = childrenOf(null);

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Услуги
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Дерево категорий и услуги с длительностью.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setDialog({ kind: "cat-create", parentId: null })}
        >
          <FolderPlus /> Категория
        </Button>
      </header>

      {roots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Категорий пока нет. Создай первую — например «Уход за волосами».
        </div>
      ) : (
        <div className="space-y-1.5">
          {roots.map((c) => (
            <CategoryNode
              key={c.id}
              category={c}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              childrenOf={childrenOf}
              servicesOf={servicesOf}
              setDialog={setDialog}
              onDeleteCategory={onDeleteCategory}
              onDeleteService={onDeleteService}
            />
          ))}
        </div>
      )}

      <EditDialog
        dialog={dialog}
        pending={pending}
        onClose={() => setDialog(null)}
        run={run}
      />
    </div>
  );
}

function CategoryNode({
  category,
  depth,
  expanded,
  toggle,
  childrenOf,
  servicesOf,
  setDialog,
  onDeleteCategory,
  onDeleteService,
}: {
  category: Category;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  childrenOf: (parentId: string | null) => Category[];
  servicesOf: (categoryId: string) => Service[];
  setDialog: (d: DialogState) => void;
  onDeleteCategory: (c: Category) => void;
  onDeleteService: (s: Service) => void;
}) {
  const subs = childrenOf(category.id);
  const svcs = servicesOf(category.id);
  const hasChildren = subs.length > 0 || svcs.length > 0;
  const isOpen = expanded.has(category.id);

  return (
    <div>
      <div
        className="group flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        <button
          onClick={() => toggle(category.id)}
          className="flex size-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100"
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown size={15} />
            ) : (
              <ChevronRight size={15} />
            )
          ) : (
            <span className="size-1.5 rounded-full bg-neutral-300" />
          )}
        </button>

        <span className="flex-1 text-sm font-medium text-neutral-800">
          {category.name}
        </span>

        <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            title="Добавить подкатегорию"
            onClick={() =>
              setDialog({
                kind: "cat-create",
                parentId: category.id,
                parentName: category.name,
              })
            }
          >
            <FolderPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Добавить услугу"
            onClick={() =>
              setDialog({
                kind: "svc-create",
                categoryId: category.id,
                categoryName: category.name,
              })
            }
          >
            <Plus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Переименовать"
            onClick={() =>
              setDialog({
                kind: "cat-edit",
                id: category.id,
                name: category.name,
              })
            }
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Удалить"
            onClick={() => onDeleteCategory(category)}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="mt-1.5 space-y-1.5">
          {svcs.map((s) => (
            <div
              key={s.id}
              className="group flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-1.5"
              style={{ marginLeft: (depth + 1) * 20 }}
            >
              <span className="flex-1 text-sm text-neutral-700">{s.name}</span>
              <span className="flex items-center gap-1 text-xs text-neutral-400">
                <Clock size={12} /> {s.duration_min} мин
              </span>
              <div className="flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Изменить"
                  onClick={() =>
                    setDialog({
                      kind: "svc-edit",
                      id: s.id,
                      name: s.name,
                      duration: s.duration_min,
                    })
                  }
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Удалить"
                  onClick={() => onDeleteService(s)}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))}

          {subs.map((c) => (
            <CategoryNode
              key={c.id}
              category={c}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              childrenOf={childrenOf}
              servicesOf={servicesOf}
              setDialog={setDialog}
              onDeleteCategory={onDeleteCategory}
              onDeleteService={onDeleteService}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EditDialog({
  dialog,
  pending,
  onClose,
  run,
}: {
  dialog: DialogState;
  pending: boolean;
  onClose: () => void;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("60");

  // синхронизируем поля при открытии конкретного диалога
  const [lastKey, setLastKey] = useState<string>("");
  const key = dialog
    ? `${dialog.kind}-${"id" in dialog ? dialog.id : "parentId" in dialog ? dialog.parentId : ""}-${"categoryId" in dialog ? dialog.categoryId : ""}`
    : "";
  if (key !== lastKey) {
    setLastKey(key);
    if (!dialog) {
      // закрытие
    } else if (dialog.kind === "cat-edit") {
      setName(dialog.name);
    } else if (dialog.kind === "svc-edit") {
      setName(dialog.name);
      setDuration(String(dialog.duration));
    } else {
      setName("");
      setDuration("60");
    }
  }

  if (!dialog) return null;

  const titles: Record<string, string> = {
    "cat-create": dialog.kind === "cat-create" && dialog.parentName
      ? `Подкатегория в «${dialog.parentName}»`
      : "Новая категория",
    "cat-edit": "Переименовать категорию",
    "svc-create":
      dialog.kind === "svc-create"
        ? `Услуга в «${dialog.categoryName}»`
        : "Новая услуга",
    "svc-edit": "Изменить услугу",
  };

  const isService = dialog.kind === "svc-create" || dialog.kind === "svc-edit";

  function submit() {
    if (!dialog) return;
    const d = Number(duration);
    if (dialog.kind === "cat-create")
      run(() => createCategory(dialog.parentId, name));
    else if (dialog.kind === "cat-edit")
      run(() => renameCategory(dialog.id, name));
    else if (dialog.kind === "svc-create")
      run(() => createService(dialog.categoryId, name, d));
    else if (dialog.kind === "svc-edit")
      run(() => updateService(dialog.id, name, d));
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titles[dialog.kind]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-neutral-500">Название</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isService) submit();
              }}
              placeholder={isService ? "Например: Женская стрижка" : "Например: Уход за волосами"}
            />
          </div>

          {isService && (
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-500">
                Длительность, мин
              </label>
              <Input
                type="number"
                min={1}
                step={5}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim()}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
