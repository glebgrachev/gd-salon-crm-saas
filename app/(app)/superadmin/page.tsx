"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Building2, Users, CalendarCheck, Shield } from "lucide-react";

type Stats = {
  totalShops: number;
  totalUsers: number;
  totalBookings: number;
};

export default function SuperAdminDashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats>({ totalShops: 0, totalUsers: 0, totalBookings: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      const { count: shopsCount } = await supabase
        .from("shops")
        .select("*", { count: "exact", head: true });

      const { count: usersCount } = await supabase
        .from("users")
        .select("*", { count: "exact", head: true });

      const { count: bookingsCount } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true });

      setStats({
        totalShops: shopsCount || 0,
        totalUsers: usersCount || 0,
        totalBookings: bookingsCount || 0,
      });
      setLoading(false);
    }

    loadStats();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-neutral-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-neutral-900" />
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Суперадмин</h1>
          <p className="text-sm text-neutral-500">Управление платформой</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/superadmin/shops"
          className="rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Салоны</span>
            <Building2 className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">{stats.totalShops}</div>
        </Link>

        <Link
          href="/superadmin/users"
          className="rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Пользователи</span>
            <Users className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">{stats.totalUsers}</div>
        </Link>

        <Link
          href="/superadmin/bookings"
          className="rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-500">Записи</span>
            <CalendarCheck className="h-5 w-5 text-neutral-400" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-neutral-900">{stats.totalBookings}</div>
        </Link>
      </div>
    </div>
  );
}