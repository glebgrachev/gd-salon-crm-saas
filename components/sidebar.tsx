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
  Megaphone,
  BarChart3,
  Gift,
  Ticket,
  UserCheck,
  Send,
  Wallet,
  CalendarDays,
  Package,
  Bell,
  Settings,
  Shield,
  Building2,
  CreditCard,
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

// Маппинг названий иконок из БД к компонентам Lucide
const ICON_MAP: Record<string, any> = {
  CalendarCheck,
  Scissors,
  Users,
  LayoutGrid,
  Megaphone,
  BarChart3,
  Gift,
  Ticket,
  UserCheck,
  Send,
  Wallet,
  CalendarDays,
  Package,
  Bell,
  Settings,
  Shield,
  Building2,
  CreditCard,
  Star,
  LogOut,
};

function getIconComponent(iconName: string | null) {
  if (!iconName) return null;
  // Пробуем найти иконку в маппинге
  const Icon = ICON_MAP[iconName];
  if (Icon) return Icon;
  
  // Пробуем динамически импортировать из Lucide
  try {
    const LucideIcon = (LucideIcons as any)[iconName];
    if (LucideIcon) return LucideIcon;
  } catch {
    // Игнорируем
  }
  
  return null;
}

export default function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [modules, setModules] = useState<Record<string, boolean> | null>(null);
  const [moduleIcons, setModuleIcons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [lockedModule, setLockedModule] = useState("");

  useEffect(() => {
    async function loadData() {
      const { data: isSuper } = await supabase.rpc("is_superadmin");
      setIsSuperAdmin(!!isSuper);

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

        // Загружаем иконки для модулей из БД
        const { data: modulesData } = await supabase
          .from("modules")
          .select("label, icon")
          .eq("is_active", true);

        const iconsMap: Record<string, string> = {};
        (modulesData || []).forEach((m) => {
          if (m.icon) {
            iconsMap[m.label.toLowerCase()] = m.icon;
          }
        });
        setModuleIcons(iconsMap);
      }
      setLoading(false);
    }

    loadData();
  }, [supabase]);

  const handleLockedClick = (label: string) => {
    setLockedModule(label);
    setModalOpen(true);
  };

  // Динамические пункты меню (модули)
  const getModuleNavItems = () => {
    if (isSuperAdmin) return [];

    const moduleKeys = Object.keys(modules || {});
    const moduleNavItems = moduleKeys
      .filter((key) => key !== "clients" && key !== "bookings" && key !== "specialists")
      .map((key) => {
        const labelMap: Record<string, string> = {
          analytics: "Аналитика",
          loyalty: "Лояльность",
          newsletters: "Рассылки",
          retention: "Возвращаемость",
          promotions: "Акции",
          certificates: "Сертификаты",
          stock: "Склад",
          waitlist: "Лист ожидания",
        };

        const hrefMap: Record<string, string> = {
          analytics: "/analytics",
          loyalty: "/loyalty",
          newsletters: "/broadcasts",
          retention: "/retention",
          promotions: "/promotions",
          certificates: "/certificates",
          stock: "/stock",
          waitlist: "/waitlist",
        };

        const label = labelMap[key] || key;
        const href = hrefMap[key] || `/${key}`;
        const iconName = moduleIcons[key] || "Package";
        const IconComponent = getIconComponent(iconName) || Package;

        return {
          href,
          label,
          icon: IconComponent,
          module: key,
          isLocked: !hasModule(modules, key as ModuleKey),
        };
      });

    return moduleNavItems;
  };

  // Строим пункты меню
  const navItems = isSuperAdmin
    ? SUPERADMIN_NAV
    : [
        ...BASE_NAV,
        ...getModuleNavItems(),
      ];

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
          {navItems.map(({ href, label, icon: Icon, module, isLocked }) => {
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