"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, User, UserRound, X } from "lucide-react";
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
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Загружаем выбранного клиента
  useEffect(() => {
    if (selectedId) {
      fetch(`/api/admin/clients/search?q=${selectedId}&shopId=${shopId}&exact=true`)
        .then((res) => res.json())
        .then((data) => {
          if (data.ok && data.clients.length > 0) {
            setSelectedClient(data.clients[0]);
          }
        })
        .catch(console.error);
    }
  }, [selectedId, shopId]);

  const searchClients = useCallback(async () => {
    if (!query.trim() || query.trim().length < 2) {
      setClients([]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/clients/search?q=${encodeURIComponent(query.trim())}&shopId=${shopId}`
      );
      const data = await res.json();
      if (data.ok) {
        setClients(data.clients);
      } else {
        setClients([]);
      }
    } catch (error) {
      console.error("Ошибка поиска клиентов:", error);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, [query, shopId]);

  // Дебаунс для поиска
  useEffect(() => {
    const timer = setTimeout(() => {
      searchClients();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchClients]);

  const handleSelect = (client: Client) => {
    setSelectedClient(client);
    setQuery("");
    setClients([]);
    onSelect(client.telegram_id);
  };

  const handleClear = () => {
    setSelectedClient(null);
    setQuery("");
    setClients([]);
    onSelect(0);
  };

  const getClientName = (c: Client) => {
    const parts = [];
    if (c.first_name) parts.push(c.first_name);
    if (c.last_name) parts.push(c.last_name);
    return parts.join(" ") || "Без имени";
  };

  const getClientDisplay = (c: Client) => {
    const name = getClientName(c);
    const phone = c.phone ? ` ${c.phone}` : "";
    const guest = c.is_guest ? " 🟢 Гость" : "";
    return `${name}${phone}${guest}`;
  };

  // Если клиент выбран — показываем его
  if (selectedClient) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2">
        <span className="flex-1 text-sm">
          {getClientDisplay(selectedClient)}
        </span>
        <button
          onClick={handleClear}
          className="rounded-full p-1 hover:bg-neutral-200"
          type="button"
        >
          <X className="h-4 w-4 text-neutral-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по имени, фамилии или телефону..."
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
              onClick={() => handleSelect(c)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 border-b border-neutral-100 last:border-b-0"
            >
              {c.is_guest ? (
                <UserRound className="h-4 w-4 text-neutral-400 shrink-0" />
              ) : (
                <User className="h-4 w-4 text-blue-500 shrink-0" />
              )}
              <span className="flex-1 text-left truncate">
                {getClientName(c)}
              </span>
              {c.phone && (
                <span className="text-xs text-neutral-400 shrink-0">
                  {c.phone}
                </span>
              )}
              {c.is_guest && (
                <span className="text-xs text-neutral-400 shrink-0 ml-1">
                  Гость
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {!loading && query.trim().length >= 2 && clients.length === 0 && (
        <div className="text-sm text-neutral-500">
          Клиент не найден. Попробуйте изменить запрос.
        </div>
      )}

      {query.trim().length > 0 && query.trim().length < 2 && (
        <div className="text-sm text-neutral-400">
          Введите минимум 2 символа для поиска
        </div>
      )}
    </div>
  );
}