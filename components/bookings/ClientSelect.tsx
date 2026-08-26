"use client";

import { useState, useEffect } from "react";
import { Search, User, UserRound, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";

type Client = {
  telegram_id: number;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  is_guest: boolean;
};

type ClientSelectProps = {
  shopId: number;
  onSelect: (clientId: number) => void;
  selectedId?: number | null;
};

export function ClientSelect({ shopId, onSelect, selectedId }: ClientSelectProps) {
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (query.length >= 2) {
      searchClients();
    } else {
      setClients([]);
    }
  }, [query]);

  const searchClients = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/search?q=${encodeURIComponent(query)}&shopId=${shopId}`);
      const data = await res.json();
      if (data.ok) {
        setClients(data.clients);
      }
    } catch (error) {
      console.error("Ошибка поиска клиентов:", error);
    } finally {
      setLoading(false);
    }
  };

  const getClientName = (c: Client) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
    return name || c.phone || "Без имени";
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени или телефону..."
          className="pl-9"
        />
      </div>

      {loading && (
        <div className="text-sm text-neutral-400">Поиск...</div>
      )}

      {!loading && clients.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg border border-neutral-200">
          {clients.map((c) => (
            <button
              key={c.telegram_id}
              onClick={() => {
                onSelect(c.telegram_id);
                setQuery("");
                setClients([]);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 ${
                selectedId === c.telegram_id ? "bg-neutral-100" : ""
              }`}
            >
              {c.is_guest ? (
                <UserRound className="h-4 w-4 text-neutral-400" />
              ) : (
                <User className="h-4 w-4 text-blue-500" />
              )}
              <span className="flex-1 text-left">
                {getClientName(c)}
              </span>
              {c.phone && (
                <span className="text-xs text-neutral-400">{c.phone}</span>
              )}
              {c.is_guest && (
                <span className="text-xs text-neutral-400">Гость</span>
              )}
            </button>
          ))}
        </div>
      )}

      {!loading && query.length >= 2 && clients.length === 0 && (
        <div className="text-sm text-neutral-500">
          Клиент не найден.{" "}
          <button
            onClick={() => setShowCreate(true)}
            className="text-blue-600 hover:underline"
          >
            Создать нового
          </button>
        </div>
      )}
    </div>
  );
}