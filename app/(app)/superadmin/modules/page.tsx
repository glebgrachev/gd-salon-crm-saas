"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Package, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Module = {
  id: number;
  label: string;
  description: string | null;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
};

export default function SuperAdminModules() {
  const router = useRouter();
  const supabase = createClient();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadModules() {
      const { data, error } = await supabase
        .from("modules")
        .select("*")
        .order("sort_order");

      if (error) {
        toast.error("Не удалось загрузить модули");
      } else {
        setModules(data || []);
      }
      setLoading(false);
    }

    loadModules();
  }, [supabase]);

  const deleteModule = async (id: number, label: string) => {
    if (!confirm(`Удалить модуль «${label}»? Это может затронуть тарифы.`)) return;

    const { error } = await supabase
      .from("modules")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Не удалось удалить модуль");
    } else {
      toast.success("Модуль удалён");
      setModules(modules.filter((m) => m.id !== id));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Модули</h1>
          <p className="text-sm text-neutral-500">Управление модулями платформы</p>
        </div>
        <Button onClick={() => router.push("/superadmin/modules/new")}>
          <Plus className="h-4 w-4" />
          Создать модуль
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((mod) => (
          <div
            key={mod.id}
            className="rounded-xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-400 hover:shadow-sm"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-neutral-100 p-2">
                  <Package className="h-5 w-5 text-neutral-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900">{mod.label}</h3>
                  <p className="text-xs text-neutral-400">
                    Порядок: {mod.sort_order}
                  </p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                mod.is_active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
              }`}>
                {mod.is_active ? "Активен" : "Неактивен"}
              </span>
            </div>

            {mod.description && (
              <p className="mt-2 text-sm text-neutral-500 line-clamp-2">
                {mod.description}
              </p>
            )}

            {mod.icon && (
              <p className="mt-1 text-xs text-neutral-400">
                Иконка: {mod.icon}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => router.push(`/superadmin/modules/${mod.id}`)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Редактировать
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={() => deleteModule(mod.id, mod.label)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {modules.length === 0 && (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300">
          <p className="text-sm text-neutral-500">Модулей пока нет</p>
        </div>
      )}
    </div>
  );
}