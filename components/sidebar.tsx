"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Список пунктов для владельца салона
const OWNER_NAV = [
  { href: "/", label: "Заказы", icon: CalendarCheck },
  { href: "/specialists", label: "Специалисты", icon: Scissors },
  { href: "/schedule", label: "График работы", icon: CalendarDays },
  { href: "/clients", label: "Клиенты", icon: Users },
  { href: "/services", label: "Услуги", icon: LayoutGrid },
  { href: "/promotions", label: "Акции", icon: Megaphone },
  { href: "/loyalty", label: "Лояльность", icon: Gift },
  { href: "/certificates", label: "Сертификаты", icon: Ticket },
  { href: "/retention", label: "Возвращаемость", icon: UserCheck },
  { href: "/broadcasts", label: "Рассылки", icon: Send },
  { href: "/waitlist", label: "Лист ожидания", icon: Bell },
  { href: "/stock", label: "Склад", icon: Package },
  { href: "/payouts", label: "Зарплаты", icon: Wallet },
  { href: "/analytics", label: "Аналитика", icon: BarChart3 },
  { href: "/settings", label: "Настройки", icon: Settings },
];

// Список пунктов для суперадмина
const SUPERADMIN_NAV = [
  { href: "/superadmin", label: "Дашборд", icon: Shield },
  { href: "/superadmin/shops", label: "Салоны", icon: Building2 },
  { href: "/superadmin/users", label: "Пользователи", icon: Users },
  { href: "/superadmin/subscriptions", label: "Подписки", icon: CreditCard },
];

export default function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const supabase = createClient();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkRole() {
      const { data } = await supabase.rpc("is_superadmin");
      setIsSuperAdmin(!!data);
      setLoading(false);
    }
    checkRole();
  }, [supabase]);

  const navItems = isSuperAdmin ? SUPERADMIN_NAV : OWNER_NAV;

  if (loading) {
    return (
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
        <div className="text-sm text-neutral-400">Загрузка...</div>
      </aside>
    );
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <span className="text-sm font-semibold tracking-tight text-neutral-900">
          BeautyApp
        </span>
        <span className="block text-xs text-neutral-400">
          {isSuperAdmin ? "Суперадмин-панель" : "Админ-панель салона"}
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          // 🔥 Правильная логика определения активного пункта
          const isActive = isSuperAdmin
            ? href === "/superadmin"
              ? pathname === "/superadmin"
              : pathname.startsWith(href)
            : href === "/"
            ? pathname === "/"
            : pathname.startsWith(href);

          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-neutral-100 font-medium text-neutral-900"
                  : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
              }`}
            >
              <Icon size={17} strokeWidth={1.75} />
              {label}
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
  );
}