"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import * as LucideIcons from "lucide-react";
import {
  CalendarCheck,
  Scissors,
  Users,
  LayoutGrid,
  Wallet,
  Settings,
  Shield,
  Building2,
  CreditCard,
  Package,
  Star,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hasModule, type ModuleKey } from "@/lib/permissions-client";
import ProModal from "@/components/ProModal";

// Базовые пункты (всегда есть, без модулей)
const BASE_NAV = [
  { href: "/", label: "Заказы", icon: CalendarCheck },
  { href: "/specialists", label: "Специалисты", icon: Scissors },
  { href: "/schedule", label: "График работы", icon: CalendarDays },
  { href: "/clients", label: "Клиенты", icon: Users },
  { href: "/services", label: "Услуги", icon: LayoutGrid },
  { href: "/payouts", label: "Зарплаты", icon: Wallet },
  { href: "/settings", label: "Настройки", icon: Settings },
];

// Список пунктов для суперадмина
const SUPERADMIN_NAV = [
  { href: "/superadmin", label: "Дашборд", icon: Shield },
  { href: "/superadmin/shops", label: "Салоны", icon: Building2 },
  { href: "/superadmin/users", label: "Пользователи", icon: Users },
  { href: "/superadmin/plans", label: "Тарифы", icon: CreditCard },
  { href: "/superadmin/subscriptions", label: "Подписки", icon: CreditCard },
];

// Маппинг модулей → href
const MODULE_HREF: Record<string, string> = {
  analytics: "/analytics",
  loyalty: "/loyalty",
  newsletters: "/broadcasts",
  retention: "/retention",
  promotions: "/promotions",
  certificates: "/certificates",
  stock: "/stock",
  waitlist: "/waitlist",
};

// Маппинг модулей → label
const MODULE_LABEL: Record<string, string> = {
  analytics: "Аналитика",
  loyalty: "Лояльность",
  newsletters: "Рассылки",
  retention: "Возвращаемость",
  promotions: "Акции",
  certificates: "Сертификаты",
  stock: "Склад",
  waitlist: "Лист ожидания",
};

export default function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);
  const [allModules, setAllModules] = useState<{ key: string; icon: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [lockedModule, setLockedModule] = useState("");

  useEffect(() => {
    async function loadData() {
      const { data: isSuper } = await supabase.rpc("is_superadmin");
      setIsSuperAdmin(!!isSuper);

      // Загружаем все доступные модули из БД (для отображения в сайдбаре)
      const { data: allModulesData } = await supabase
        .from("modules")
        .select("label, icon")
        .eq("is_active", true)
        .order("sort_order");

      const modulesList = (allModulesData || [])
        .map((m) => {
          const key = m.label.toLowerCase();
          // Пропускаем базовые модули (они уже в BASE_NAV)
          if (["clients", "bookings", "specialists"].includes(key)) return null;
          return { key, icon: m.icon };
        })
        .filter(Boolean) as { key: string; icon: string | null }[];

      setAllModules(modulesList);

      // Загружаем модули для текущего салона
      if (!isSuper) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: admin } = await supabase
            .from("admins")
            .select("shop_id")
            .eq("user_uid", user.id)
            .single();

          if (admin?.shop_id) {
            const { data: shop } = await supabase
              .from("shops")
              .select("modules")
              .eq("id", admin.shop_id)
              .single();
            setModules(shop?.modules ?? {});
          }
        }
      }
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const handleLockedClick = (label: string) => {
    setLockedModule(label);
    setModalOpen(true);
  };

  // Получаем иконку по имени
  const getIconComponent = (iconName: string | null) => {
    if (!iconName) return Package;
    try {
      const Icon = (LucideIcons as any)[iconName];
      return Icon || Package;
    } catch {
      return Package;
    }
  };

  // Строим пункты меню для владельца салона
  const ownerNavItems = [
    ...BASE_NAV,
    ...allModules.map(({ key, icon }) => {
      const isLocked = !hasModule(modules, key as ModuleKey);
      const IconComponent = getIconComponent(icon);
      return {
        href: MODULE_HREF[key] || `/${key}`,
        label: MODULE_LABEL[key] || key,
        icon: IconComponent,
        module: key,
        isLocked,
      };
    }),
  ];

  const navItems = isSuperAdmin
    ? SUPERADMIN_NAV.map((item) => ({ ...item, isLocked: false }))
    : ownerNavItems;

  if (loading) {
    return (
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
        <div className="text-sm text-neutral-400">Загрузка...</div>
      </aside>
    );
  }

  return (
    <>
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="px-5 py-5">
          <span className="text-sm font-semibold tracking-tight text-neutral-900">
            BeautyApp
          </span>
          <span className="block text-xs text-neutral-400">
            {isSuperAdmin ? "Управление платформой" : "Админ-панель салона"}
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {navItems.map(({ href, label, icon: Icon, isLocked }) => {
            const isActive = isSuperAdmin
              ? href === "/superadmin"
                ? pathname === "/superadmin"
                : pathname.startsWith(href)
              : href === "/"
              ? pathname === "/"
              : pathname.startsWith(href);

            const locked = isSuperAdmin ? false : (isLocked ?? false);

            return (
              <Link
                key={href}
                href={locked ? "#" : href}
                onClick={(e) => {
                  if (locked) {
                    e.preventDefault();
                    handleLockedClick(label);
                  }
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-neutral-100 font-medium text-neutral-900"
                    : locked
                    ? "text-neutral-500 hover:bg-neutral-50"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                <Icon size={17} strokeWidth={1.75} />
                {label}
                {locked && (
                  <Star className="ml-auto h-4 w-4 fill-amber-200 text-amber-400" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-neutral-200 p-3">
          <div className="truncate px-3 pb-2 text-xs text-neutral-400">
            {email}
          </div>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
            >
              <LogOut size={17} strokeWidth={1.75} />
              Выйти
            </button>
          </form>
        </div>
      </aside>

      <ProModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        moduleName={lockedModule}
      />
    </>
  );
}