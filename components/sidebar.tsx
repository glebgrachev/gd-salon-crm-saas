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
  LogOut,
} from "lucide-react";

const NAV = [
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
];

export default function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="px-5 py-5">
        <span className="text-sm font-semibold tracking-tight text-neutral-900">
          BeautyApp
        </span>
        <span className="block text-xs text-neutral-400">Админ-панель салона</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
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
