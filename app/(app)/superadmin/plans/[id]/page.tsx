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
  is_active: boolean;
};

type Plan = {
  id: number;
  name: string;
  description: string | null;
  price_monthly: number;
  features: Record<string, number>;
  is_active: boolean;
  sort_order: number;
};

export default function PlanEditPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();
  const isNew = params.id === "new";
  
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<Plan>({
    id: 0,
    name: "",
    description: "",
    price_monthly: 0,
    features: {},
    is_active: true,
    sort_order: 1,
  });
  const [allModules, setAllModules] = useState<Module[]>([]);

  useEffect(() => {
    async function loadData() {
      // Загружаем все модули
      const { data: modulesData } = await supabase
        .from("modules")
        .select("*")
        .order("sort_order");

      setAllModules(modulesData || []);

      if (isNew) {
        // Для нового тарифа — вычисляем следующий порядковый номер
        const { data, error } = await supabase
          .from("plans")
          .select("sort_order")
          .order("sort_order", { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          const nextOrder = data[0].sort_order + 1;
          setPlan((prev) => ({ ...prev, sort_order: nextOrder }));
        }
        setLoading(false);
      } else {
        const { data, error } = await supabase
          .from("plans")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error) {
          toast.error("Не удалось загрузить тариф");
          router.push("/superadmin/plans");
          return;
        }

        setPlan(data);
        setLoading(false);
      }
    }

    loadData();
  }, [params.id, isNew, router, supabase]);

  const toggleModule = (key: string) => {
    const newFeatures = { ...plan.features };
    if (newFeatures[key]) {
      delete newFeatures[key];
    } else {
      newFeatures[key] = -1;
    }
    setPlan({ ...plan, features: newFeatures });
  };

  const savePlan = async () => {
    if (!plan.name.trim()) {
      toast.error("Введите название тарифа");
      return;
    }

    setSaving(true);

    const data = {
      name: plan.name.trim(),
      description: plan.description?.trim() || null,
      price_monthly: plan.price_monthly,
      features: plan.features,
      is_active: plan.is_active,
      sort_order: plan.sort_order,
    };

    let error;
    if (isNew) {
      const { error: insertError } = await supabase
        .from("plans")
        .insert(data);
      error = insertError;
    } else {
      const { error: updateError } = await supabase
        .from("plans")
        .update(data)
        .eq("id", plan.id);
      error = updateError;
    }

    if (error) {
      toast.error(isNew ? "Не удалось создать тариф" : "Не удалось обновить тариф");
    } else {
      toast.success(isNew ? "Тариф создан" : "Тариф обновлён");
      router.push("/superadmin/plans");
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
          href="/superadmin/plans"
          className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Link>
        <h1 className="text-2xl font-semibold text-neutral-900">
          {isNew ? "Создать тариф" : `Редактировать ${plan.name}`}
        </h1>
      </div>

      <div className="space-y-6">
        {/* Основная информация */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-neutral-900">Основная информация</h2>
          
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">Название</label>
              <Input
                value={plan.name}
                onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                placeholder="Например: PRO"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Описание</label>
              <Textarea
                value={plan.description || ""}
                onChange={(e) => setPlan({ ...plan, description: e.target.value })}
                placeholder="Краткое описание тарифа"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">Цена, ₽/мес</label>
                <Input
                  type="number"
                  min={0}
                  value={plan.price_monthly}
                  onChange={(e) => setPlan({ ...plan, price_monthly: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">Порядок сортировки</label>
                <Input
                  type="number"
                  min={1}
                  value={plan.sort_order}
                  onChange={(e) => setPlan({ ...plan, sort_order: Number(e.target.value) })}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={plan.is_active}
                onChange={(e) => setPlan({ ...plan, is_active: e.target.checked })}
                className="size-4 rounded border-neutral-300"
              />
              Тариф активен
            </label>
          </div>
        </div>

        {/* Модули */}
        <div className="rounded-xl border border-neutral-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-neutral-900">Модули</h2>
          <p className="mt-1 text-xs text-neutral-400">
            Выберите модули, которые входят в тариф
          </p>

          <div className="mt-4 space-y-2">
            {allModules.map((mod) => {
              const moduleKey = mod.label.toLowerCase();
              const isActive = !!plan.features[moduleKey];
              
              return (
                <div
                  key={mod.id}
                  className="flex items-center justify-between rounded-lg border border-neutral-100 px-4 py-3"
                >
                  <div>
                    <span className="text-sm text-neutral-700">{mod.label}</span>
                    {mod.description && (
                      <p className="text-xs text-neutral-400">{mod.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggleModule(moduleKey)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                      isActive ? "bg-neutral-900" : "bg-neutral-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                        isActive ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/superadmin/plans")}
            disabled={saving}
          >
            Отмена
          </Button>
          <Button
            onClick={savePlan}
            disabled={saving}
            className="flex-1"
          >
            {saving ? "Сохранение..." : isNew ? "Создать тариф" : "Сохранить изменения"}
          </Button>
        </div>
      </div>
    </div>
  );
}