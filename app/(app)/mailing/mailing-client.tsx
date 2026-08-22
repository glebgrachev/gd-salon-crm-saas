"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { previewRecipients } from "./actions";
import { useShop } from "@/contexts/ShopContext";

type Row = {
  id: string;
  segments: string[];
  text: string;
  cta_url: string | null;
  status: string;
  total: number;
  sent: number;
  failed: number;
  opted_out: number;
  created_at: string;
  finished_at: string | null;
};

const SEG_KEYS = ["all", "new", "regular", "sleeping", "lost", "no_visits"] as const;
type SegKey = (typeof SEG_KEYS)[number];

const SEG_LABEL: Record<SegKey, string> = {
  all: "Все клиенты",
  new: "Новые",
  regular: "Постоянные",
  sleeping: "Спящие",
  lost: "Потерянные",
  no_visits: "Без визитов",
};

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function MailingClient({
  history,
  segmentCounts,
}: {
  history: Row[];
  segmentCounts: Record<string, number>;
}) {
  const { shopId, loading } = useShop();
  const [selected, setSelected] = useState<Set<SegKey>>(new Set());
  const [text, setText] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [sending, startTransition] = useTransition();
  const router = useRouter();

  // Логируем shopId при каждом рендере
  console.log('📊 MailingClient: shopId =', shopId, 'loading =', loading);

  // preview числа получателей при изменении выбора сегментов
  useEffect(() => {
    console.log('📊 useEffect: selected =', [...selected]);
    
    if (selected.size === 0) {
      console.log('📊 useEffect: selected empty, setCount(null)');
      setCount(null);
      return;
    }
    
    let cancelled = false;
    (async () => {
      console.log('📊 useEffect: calling previewRecipients with', [...selected]);
      const r = await previewRecipients([...selected]);
      console.log('📊 useEffect: previewRecipients result =', r);
      if (!cancelled) {
        const newCount = r.ok ? r.count ?? 0 : null;
        console.log('📊 useEffect: setCount =', newCount);
        setCount(newCount);
      }
    })();
    
    return () => {
      console.log('📊 useEffect: cancelled');
      cancelled = true;
    };
  }, [selected]);

  function toggle(k: SegKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (k === "all") {
        return next.has("all") ? new Set() : new Set<SegKey>(["all"]);
      }
      next.delete("all");
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function send() {
    console.log('📊 send: START');
    console.log('📊 send: shopId =', shopId, 'type =', typeof shopId);
    console.log('📊 send: loading =', loading);
    console.log('📊 send: selected =', [...selected]);
    console.log('📊 send: text =', text);
    console.log('📊 send: count =', count);
    
    if (selected.size === 0) {
      toast.error("Выберите хотя бы один сегмент");
      return;
    }
    if (!text.trim()) {
      toast.error("Введите текст сообщения");
      return;
    }
    if (text.trim().length > 3500) {
      toast.error("Текст слишком длинный (макс. 3500 символов)");
      return;
    }
    if (count === 0) {
      toast.error("В выбранных сегментах нет получателей");
      return;
    }
    if (!shopId) {
      console.error('❌ send: shopId is null or undefined!');
      toast.error("Ошибка: салон не найден");
      return;
    }

    startTransition(async () => {
      console.log('📊 send: Отправка запроса к API...');
      const payload = {
        segments: [...selected],
        text: text.trim(),
        cta_url: ctaUrl.trim() || undefined,
        shop_id: shopId,
        initData: window.Telegram?.WebApp?.initData || '',
      };
      console.log('📊 send: payload =', payload);
      
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      const data = await res.json().catch(() => null);
      console.log('📊 send: response =', { ok: res.ok, status: res.status, data });
      
      if (res.ok && data?.ok) {
        toast.success(
          data.mode === "sync"
            ? `Отправлено ${data.total} получателям`
            : `Отправка запущена (${data.total} получателей). Прогресс — в истории.`,
        );
        setText("");
        setCtaUrl("");
        setSelected(new Set());
        router.refresh();
      } else {
        toast.error(data?.error ?? "Не удалось отправить");
        console.error('❌ Ошибка отправки:', data);
      }
    });
  }

  const totalPreview = count;
  console.log('📊 render: count =', count, 'totalPreview =', totalPreview, 'selected size =', selected.size);

  const isDisabled = sending || selected.size === 0 || !text.trim() || count === 0 || count === null;

  console.log('📊 Кнопка состояние:', {
    isDisabled,
    sending,
    selectedSize: selected.size,
    hasText: !!text.trim(),
    textLength: text.length,
    count,
    countIsZero: count === 0,
    countIsNull: count === null
  });

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">
      <div className="text-neutral-500">Загрузка...</div>
    </div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">Рассылки</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Отправьте сообщение клиентам выбранных сегментов. Отписанные автоматически исключаются.
      </p>

      <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-6">
        <div className="text-sm font-medium text-neutral-800">Кому отправить</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SEG_KEYS.map((k) => {
            const on = selected.has(k);
            return (
              <button
                key={k}
                onClick={() => toggle(k)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                  on
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                }`}
              >
                {SEG_LABEL[k]} · {segmentCounts[k] ?? 0}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <label className="block text-xs text-neutral-500">Текст сообщения</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Например: 💜 Скидка 15% на укладку до конца недели! Успейте записаться."
            rows={6}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <div className="mt-1 flex justify-between text-xs text-neutral-400">
            <span>Поддерживается HTML: &lt;b&gt;, &lt;i&gt;, &lt;a href&gt;</span>
            <span>{text.length} / 3500</span>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs text-neutral-500">Ссылка кнопки (необязательно)</label>
          <input
            value={ctaUrl}
            onChange={(e) => setCtaUrl(e.target.value)}
            placeholder="https://beauty-miniapp-saas.vercel.app/ (по умолчанию — Записаться)"
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
          />
          <p className="mt-1 text-xs text-neutral-400">
            Если пусто — покажется кнопка «Записаться» в приложении.
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <div className="text-sm text-neutral-500">
            {totalPreview == null
              ? "Выберите сегменты, чтобы увидеть число получателей"
              : `Получат сообщение: ${totalPreview} чел.`}
          </div>
          <button
            onClick={send}
            disabled={isDisabled}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
          >
            {sending ? "Отправляем…" : "Отправить сейчас"}
          </button>
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 text-sm font-medium text-neutral-800">История рассылок</div>
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3">Когда</th>
                <th className="px-4 py-3">Сегменты</th>
                <th className="px-4 py-3">Сообщение</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3 text-right">Отправлено</th>
                <th className="px-4 py-3 text-right">Ошибки</th>
                <th className="px-4 py-3 text-right">Отписки</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    Ещё не было рассылок.
                  </td>
                </tr>
              )}
              {history.map((b) => {
                const st =
                  b.status === "done"
                    ? { label: "Готово", cls: "bg-emerald-100 text-emerald-700" }
                    : b.status === "sending"
                    ? { label: "Идёт", cls: "bg-amber-100 text-amber-700" }
                    : { label: "Ошибка", cls: "bg-red-100 text-red-600" };
                return (
                  <tr key={b.id} className="border-b border-neutral-100 last:border-0 align-top">
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {fmtDateTime(b.created_at)}
                      {b.finished_at && (
                        <div className="text-neutral-400">до {fmtDateTime(b.finished_at)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-600">
                      {b.segments.map((s) => SEG_LABEL[s as SegKey] ?? s).join(", ")}
                    </td>
                    <td className="max-w-md px-4 py-3 text-neutral-800">
                      <div className="line-clamp-2 whitespace-pre-wrap">{b.text}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                      <div className="mt-0.5 text-xs text-neutral-400">{b.total} всего</div>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-800">{b.sent}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{b.failed}</td>
                    <td className="px-4 py-3 text-right text-neutral-500">{b.opted_out}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}