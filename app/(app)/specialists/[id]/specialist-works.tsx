"use client";

import { useState, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadImage } from "@/lib/upload";
import { addWork, deleteWork } from "./actions";

export type Work = { id: string; image_url: string; caption: string | null };

export default function SpecialistWorks({
  specialistId,
  works,
}: {
  specialistId: string;
  works: Work[];
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [caption, setCaption] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "works");
      const cap = caption;
      startTransition(async () => {
        const r = await addWork(specialistId, url, cap);
        if (!r.ok) toast.error(r.error ?? "Ошибка");
        else {
          toast.success("Работа добавлена");
          setCaption("");
        }
      });
    } catch (err) {
      toast.error("Не удалось загрузить: " + (err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteWork(specialistId, id);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-8 pb-10">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">
        Лучшие работы
      </h2>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Подпись (необязательно)"
          className="min-w-0 flex-1"
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={uploading || pending}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          Загрузить работу
        </Button>
      </div>

      {works.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-12 text-center text-sm text-neutral-500">
          Работ пока нет.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {works.map((w) => (
            <div
              key={w.id}
              className="group relative overflow-hidden rounded-xl border border-neutral-200 bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={w.image_url}
                alt={w.caption ?? "Работа"}
                className="aspect-square w-full object-cover"
              />
              {w.caption && (
                <div className="px-2 py-1.5 text-xs text-neutral-600">
                  {w.caption}
                </div>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => remove(w.id)}
                className="absolute top-1.5 right-1.5 bg-white/80 opacity-0 transition group-hover:opacity-100"
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
