"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, CreditCard, Zap, Crown, Star, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

type Plan = {
  id: number;
  name: string;
  description: string | null;
  price_monthly: number;
  price_byn: number; // 👈 Добавляем поле для BYN
  features: Record<string, number>;
  is_active: boolean;
  sort_order: number;
};

const PLAN_ICONS: Record<number, any> = {
  1: Zap,
  2: Star,
  3: Crown,
};

const PLAN_COLORS: Record<number, string> = {
  1: "bg-neutral-100 text-neutral-600",
  2: "bg-blue-100 text-blue-700",
  3: "bg-amber-100 text-amber-700",
};

export default function SuperAdminPlans() {
  const router = useRouter();
  const supabase = createClient();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPlans() {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("sort_order");

      if (error) {
        toast.error("Не удалось загрузить тарифы");
      } else {
        setPlans(data || []);
      }
      setLoading(false);
    }

    loadPlans();
  }, [supabase]);

  const deletePlan = async (id: number, name: string) => {
    if (!confirm(`Удалить тариф «${name}»?`)) return;

    const { error } = await supabase
      .from("plans")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error("Не удалось удалить тариф");
    } else {
      toast.success("Тариф удалён");
      setPlans(plans.filter((p) => p.id !== id));
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
          <h1 className="text-2xl font-semibold text-neutral-900">Тарифы</h1>
          <p className="text-sm text-neutral-500">Управление тарифами платформы</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.push("/superadmin/modules")}
          >
            <Package className="h-4 w-4" />
            Управление модулями
          </Button>
          <Button onClick={() => router.push("/superadmin/plans/new")}>
            <Plus className="h-4 w-4" />
            Создать тариф
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => {
          const Icon = PLAN_ICONS[plan.id] || CreditCard;
          const colorClass = PLAN_COLORS[plan.id] || "bg-neutral-100 text-neutral-600";
          const moduleCount = Object.keys(plan.features || {}).length;
          
          return (
            <div
              key={plan.id}
              className="rounded-xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-400 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${colorClass}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-neutral-900">{plan.name}</h3>
                    <div className="flex items-center gap-2 text-xs">
                      {plan.price_monthly === 0 ? (
                        <span className="text-neutral-400">Бесплатно</span>
                      ) : (
                        <>
                          <span className="text-neutral-600">{plan.price_monthly} ₽</span>
      <span className="text-neutral-300">/</span>
      <span className="text-neutral-600">{plan.price_byn} Br</span>
                        </>
                      )}
                      <span className="text-neutral-400">/мес</span>
                    </div>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  plan.is_active ? "bg-emerald-100 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                }`}>
                  {plan.is_active ? "Активен" : "Неактивен"}
                </span>
              </div>

              {plan.description && (
                <p className="mt-2 text-sm text-neutral-500 line-clamp-2">
                  {plan.description}
                </p>
              )}

              <div className="mt-4 flex items-center gap-4 text-xs text-neutral-400">
                <span>{moduleCount} модулей</span>
                <span>Порядок: {plan.sort_order}</span>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => router.push(`/superadmin/plans/${plan.id}`)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Редактировать
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={() => deletePlan(plan.id, plan.name)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {plans.length === 0 && (
        <div className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300">
          <p className="text-sm text-neutral-500">Тарифов пока нет</p>
        </div>
      )}
    </div>
  );
}