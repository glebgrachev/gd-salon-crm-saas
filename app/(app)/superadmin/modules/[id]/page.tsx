"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Module = {
  id: number;
  label: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

export default function ModuleEditPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const isNew = params.id === "new";
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [module, setModule] = useState<Module>({
    id: 0,
    label: "",
    description: "",
    icon: null,
    is_active: true,
    sort_order: 1,
  });

  useEffect(() => {
    async function loadData() {
      if (isNew) {
        // Для нового модуля — вычисляем следующий порядковый номер
        const { data, error } = await supabase
          .from("modules")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const nextOrder = data[0].sort_order + 1;
          setModule((prev) => ({ ...prev, sort_order: nextOrder }));
        }
        setLoading(false);
      } else {
        const { data, error } = await supabase
          .from("modules")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error) {
          toast.error("Не удалось загрузить модуль");
          router.push("/superadmin/modules");
          return;
        }

        setModule(data);
        setLoading(false);
      }
    }

    loadData();
  }, [params.id, isNew, router, supabase]);

  const saveModule = async () => {
    if (!module.label.trim()) {
      toast.error("Введите название модуля");
      return;
    }

    setSaving(true);

    const data = {
      label: module.label.trim(),
      description: module.description?.trim() || null,
      icon: module.icon?.trim() || null,
      is_active: module.is_active,
      sort_order: module.sort_order,
    };

    let error;
    if (isNew) {
      const { error: insertError } = await supabase
        .from("modules")
        .insert(data);
      error = insertError;
    } else {
      const { error: updateError } = await supabase
        .from("modules")
        .update(data)
        .eq("id", module.id);
      error = updateError;
    }

    if (error) {
      toast.error(isNew ? "Не удалось создать модуль" : "Не удалось обновить модуль");
    } else {
      toast.success(isNew ? "Модуль создан" : "Модуль обновлён");
      router.push("/superadmin/modules");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/superadmin/modules"
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {isNew ? "Создать модуль" : `Редактировать ${module.label}`}
        </h1>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-neutral-900">Информация о модуле</h2>
          
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Название <span className="text-red-500">*</span>
              </label>
              <Input
                value={module.label}
                onChange={(e) => setModule({ ...module, label: e.target.value })}
                placeholder="Например: Аналитика"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Используется как ключ в системе (латиницей)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Описание</label>
              <Textarea
                value={module.description || ""}
                onChange={(e) => setModule({ ...module, description: e.target.value })}
                placeholder="Что делает этот модуль"
                rows={2}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Иконка</label>
              <Input
                value={module.icon || ""}
                onChange={(e) => setModule({ ...module, icon: e.target.value })}
                placeholder="Название иконки из Lucide (например: BarChart3)"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Доступные иконки: BarChart3, Gift, Send, UserCheck, Megaphone, Ticket, Package, Bell, Users, CalendarCheck, Scissors
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Порядок сортировки</label>
                <Input
                  type="number"
                  min={1}
                  value={module.sort_order}
                  onChange={(e) => setModule({ ...module, sort_order: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={module.is_active}
                    onChange={(e) => setModule({ ...module, is_active: e.target.checked })}
                    className="size-4 rounded border-neutral-300"
                  />
                  Модуль активен
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/superadmin/modules")}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button
            onClick={saveModule}
            disabled={saving}
            className="flex-1"
          >
            {saving ? "Сохранение..." : isNew ? "Создать модуль" : "Сохранить изменения"}
          </Button>
        </div>
      </div>
    </div>
  );
}