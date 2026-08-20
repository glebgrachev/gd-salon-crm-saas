"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
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

// Список пунктов для владельца салона не суперадминов
const OWNER_NAV = [
  { href: "/", label: "Записи", icon: CalendarCheck, module: null },
  { href: "/specialists", label: "Специалисты", icon: Scissors, module: null },
  { href: "/schedule", label: "График работы", icon: CalendarDays, module: null },
  { href: "/clients", label: "Клиенты", icon: Users, module: null },
  { href: "/services", label: "Услуги", icon: LayoutGrid, module: null },
  { href: "/promotions", label: "Акции", icon: Megaphone, module: "promotions" },
  { href: "/loyalty", label: "Лояльность", icon: Gift, module: "loyalty" },
  { href: "/certificates", label: "Сертификаты", icon: Ticket, module: "certificates" },
  { href: "/retention", label: "Возвращаемость", icon: UserCheck, module: "retention" },
  { href: "/mailing", label: "Рассылки", icon: Send, module: "newsletters" },
  { href: "/waitlist", label: "Лист ожидания", icon: Bell, module: "waitlist" },
  { href: "/stock", label: "Склад", icon: Package, module: "stock" },
  { href: "/payouts", label: "Зарплаты", icon: Wallet, module: null },
  { href: "/analytics", label: "Аналитика", icon: BarChart3, module: "analytics" },
  { href: "/settings", label: "Настройки", icon: Settings, module: null },
];

// Список пунктов для суперадмина
const SUPERADMIN_NAV = [
  { href: "/superadmin", label: "Дашборд", icon: Shield },
  { href: "/superadmin/shops", label: "Салоны", icon: Building2 },
  { href: "/superadmin/users", label: "Пользователи", icon: Users },
  { href: "/superadmin/plans", label: "Тарифы", icon: CreditCard },
];

export default function Sidebar({ email }: { email?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [modules, setModules] = useState<Record<string, any> | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [lockedModule, setLockedModule] = useState("");

  useEffect(() => {
    async function loadData() {
      const { data: isSuper } = await supabase.rpc("is_superadmin");
      setIsSuperAdmin(!!isSuper);

      // Загружаем модули и название салона только для владельцев салонов
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
              .select("name, modules")
              .eq("id", admin.shop_id)
              .single();
            
            setShopName(shop?.name ?? null);
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

  // Строим пункты меню с пометкой о блокировке
  const navItems = isSuperAdmin
    ? SUPERADMIN_NAV
    : OWNER_NAV.map((item) => {
        const isLocked = item.module && !hasModule(modules, item.module as ModuleKey);
        return { ...item, isLocked: !!isLocked };
      });

  if (loading) {
    return (
      <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
        <div className="text-sm text-neutral-400">Загрузка...</div>
      </aside>
    );
  }

  return (
    <>
      <aside className="flex h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white">
        {/* Шапка сайдбара */}
        <div className="px-5 py-5">
          <span className="text-xl font-semibold tracking-tight text-neutral-900">
            {isSuperAdmin ? "BeautyApp" : shopName || "BeautyApp"}
          </span>
          <span className="block text-xs text-neutral-400">
            {isSuperAdmin ? "Управление платформой" : "Платформа BeautyApp"}
          </span>
        </div>

        {/* Навигация — скроллится, занимает всё свободное пространство */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {navItems.map(({ href, label, icon: Icon, isLocked }) => {
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
                href={isLocked ? "#" : href}
                onClick={(e) => {
                  if (isLocked) {
                    e.preventDefault();
                    handleLockedClick(label);
                  }
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  isActive
                    ? "bg-neutral-100 font-medium text-neutral-900"
                    : isLocked
                    ? "text-neutral-500 hover:bg-neutral-50"
                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                }`}
              >
                <Icon size={17} strokeWidth={1.75} />
                {label}
                {isLocked && (
                  <Star className="ml-auto h-4 w-4 fill-amber-200 text-amber-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Футер сайдбара — прижат к низу */}
        <div className="shrink-0 border-t border-neutral-200 px-3 py-2">
          {/* Почта для суперадмина */}
          {isSuperAdmin && email && (
            <div className="truncate px-3 pb-1.5 text-xs text-neutral-400">
              {email}
            </div>
          )}

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-sm text-neutral-600 transition hover:bg-neutral-50 hover:text-neutral-900"
            >
              <LogOut size={17} strokeWidth={1.75} />
              Выйти
            </button>
          </form>
          
          {/* Копирайт для владельцев салонов */}
          {!isSuperAdmin && (
            <div className="mt-2 border-t border-neutral-100 pt-2">
              <span className="text-[10px] text-neutral-500">
                © {new Date().getFullYear()} Студия D&G Digital Lab
              </span>
            </div>
          )}
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