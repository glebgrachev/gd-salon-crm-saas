"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Users, Calendar, User } from "lucide-react";

type User = {
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  phone: string | null;
  created_at: string;
  shop_id: number | null;
};

export default function SuperAdminUsers() {
  const supabase = createClient();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUsers() {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Ошибка загрузки пользователей:", error);
      } else {
        setUsers(data || []);
      }
      setLoading(false);
    }

    loadUsers();
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900">Пользователи</h1>
          <p className="text-sm text-neutral-500">Все клиенты платформы</p>
        </div>
        <div className="text-sm text-neutral-500">
          Всего: <span className="font-medium text-neutral-900">{users.length}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-4 py-3">Пользователь</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">Салон</th>
              <th className="px-4 py-3 text-right">Дата регистрации</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-neutral-400">
                  Пользователей пока нет
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.telegram_id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100">
                      <User className="h-4 w-4 text-neutral-600" />
                    </div>
                    <div>
                      <div className="font-medium text-neutral-900">
                        {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div className="text-xs text-neutral-400">
                        {u.username ? `@${u.username}` : `ID: ${u.telegram_id}`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-600">{u.phone || "—"}</td>
                <td className="px-4 py-3 text-neutral-600">
                  {u.shop_id ? `Салон #${u.shop_id}` : "—"}
                </td>
                <td className="px-4 py-3 text-right text-neutral-400">
                  {new Date(u.created_at).toLocaleDateString("ru-RU")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}