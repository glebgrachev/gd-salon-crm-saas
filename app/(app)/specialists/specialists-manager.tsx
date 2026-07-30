"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Star, Upload, Loader2 } from "lucide-react";
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
  createSpecialist,
  updateSpecialist,
  deleteSpecialist,
} from "./actions";

export type Specialist = {
  id: string;
  full_name: string;
  photo_url: string | null;
  bio: string | null;
  experience_years: number;
  rating: number;
  is_active: boolean;
};

type FormState = {
  id: string | null;
  full_name: string;
  experience_years: string;
  bio: string;
  photo_url: string | null;
  is_active: boolean;
};

const EMPTY: FormState = {
  id: null,
  full_name: "",
  experience_years: "0",
  bio: "",
  photo_url: null,
  is_active: true,
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function SpecialistsManager({
  initial,
}: {
  initial: Specialist[];
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function openCreate() {
    setForm({ ...EMPTY });
  }
  function openEdit(s: Specialist) {
    setForm({
      id: s.id,
      full_name: s.full_name,
      experience_years: String(s.experience_years),
      bio: s.bio ?? "",
      photo_url: s.photo_url,
      is_active: s.is_active,
    });
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "specialists");
      setForm({ ...form, photo_url: url });
    } catch (err) {
      toast.error("Не удалось загрузить фото: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function save() {
    if (!form) return;
    const payload = {
      full_name: form.full_name,
      experience_years: Number(form.experience_years),
      bio: form.bio,
      photo_url: form.photo_url,
      is_active: form.is_active,
    };
    startTransition(async () => {
      const r = form.id
        ? await updateSpecialist(form.id, payload)
        : await createSpecialist(payload);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else {
        toast.success(form.id ? "Сохранено" : "Мастер добавлен");
        setForm(null);
        router.refresh();
      }
    });
  }

  function remove(s: Specialist) {
    if (!confirm(`Удалить мастера «${s.full_name}»?`)) return;
    startTransition(async () => {
      const r = await deleteSpecialist(s.id);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else {
        toast.success("Мастер удалён");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
            Специалисты
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            Мастера салона: фото, опыт, рейтинг.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Добавить
        </Button>
      </header>

      {initial.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Мастеров пока нет. Добавь первого.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initial.map((s) => (
            <div
              key={s.id}
              onClick={() => router.push(`/specialists/${s.id}`)}
              className="group relative cursor-pointer rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                {s.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.photo_url}
                    alt={s.full_name}
                    className="size-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-14 items-center justify-center rounded-full bg-neutral-100 text-sm font-medium text-neutral-500">
                    {initials(s.full_name)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-900">
                    {s.full_name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                    <span className="inline-flex items-center gap-0.5">
                      <Star size={12} className="fill-amber-400 text-amber-400" />
                      {s.rating?.toFixed(1) ?? "0.0"}
                    </span>
                    <span>· {s.experience_years} лет опыта</span>
                  </div>
                </div>
              </div>

              {s.bio && (
                <p className="mt-3 line-clamp-2 text-xs text-neutral-500">
                  {s.bio}
                </p>
              )}

              <div className="mt-3 flex items-center justify-between">
                {s.is_active ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-200 bg-emerald-100 text-emerald-700"
                  >
                    Активен
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-neutral-200 bg-neutral-100 text-neutral-500"
                  >
                    Скрыт
                  </Badge>
                )}
                <div
                  className="flex gap-0.5 opacity-0 transition group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(s)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {form?.id ? "Редактировать мастера" : "Новый мастер"}
            </DialogTitle>
          </DialogHeader>

          {form && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                {form.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.photo_url}
                    alt=""
                    className="size-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex size-16 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    {form.full_name ? initials(form.full_name) : "?"}
                  </div>
                )}
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickFile}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {form.photo_url ? "Заменить фото" : "Загрузить фото"}
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500">ФИО</label>
                <Input
                  value={form.full_name}
                  onChange={(e) =>
                    setForm({ ...form, full_name: e.target.value })
                  }
                  placeholder="Например: Анна Иванова"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500">
                  Опыт работы, лет
                </label>
                <Input
                  type="number"
                  min={0}
                  value={form.experience_years}
                  onChange={(e) =>
                    setForm({ ...form, experience_years: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-neutral-500">О мастере</label>
                <Textarea
                  rows={3}
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="Специализация, регалии, стиль работы"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm({ ...form, is_active: e.target.checked })
                  }
                  className="size-4 rounded border-neutral-300"
                />
                Активен (показывать в приложении)
              </label>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setForm(null)}
              disabled={pending}
            >
              Отмена
            </Button>
            <Button
              onClick={save}
              disabled={pending || uploading || !form?.full_name.trim()}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}