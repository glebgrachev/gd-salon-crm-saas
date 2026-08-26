// app/(app)/clients/[id]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StatusSelect from "./status-select";
import RetentionResetButton from "./retention-reset";
import {
  fmtDateTime,
  fmtPrice,
  type BookingStatus,
} from "@/lib/bookings";

export const dynamic = "force-dynamic";

type B = {
  id: string;
  starts_at: string;
  status: BookingStatus;
  price_snapshot: number | null;
  specialist: { full_name: string } | null;
  service: { name: string } | null;
};

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  const { data: shop } = await supabase
    .from("shops")
    .select("currency_id")
    .eq("id", shopId)
    .single();

  let currency = null;
  if (shop?.currency_id) {
    const { data: currencyData } = await supabase
      .from("currencies")
      .select("*")
      .eq("id", shop.currency_id)
      .single();
    currency = currencyData;
  }

  const { data: client } = await supabase
    .from("users")
    .select("telegram_id, first_name, last_name, username, phone, created_at, shop_id, is_guest")
    .eq("telegram_id", id)
    .maybeSingle();

  if (!client) notFound();

  if (client.shop_id !== shopId) {
    notFound();
  }

  const { data: shopData } = await supabase
    .from("shops")
    .select("modules")
    .eq("id", shopId)
    .single();

  const shopModules = shopData?.modules ?? null;

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, status, price_snapshot, shop_id, specialist:specialists ( full_name ), service:services ( name )",
    )
    .eq("client_id", id)
    .eq("shop_id", shopId)
    .order("starts_at", { ascending: false });

  const { data: loyalty } = await supabase
    .from("loyalty_accounts")
    .select("balance, total_earned, total_spent")
    .eq("client_id", id)
    .eq("shop_id", shopId)
    .maybeSingle();
  const points = Number(loyalty?.balance ?? 0);

  const { data: seg } = await supabase
    .from("v_client_segments")
    .select("segment, last_visit, days_since_last, visits, retention_notified_at")
    .eq("client_id", id)
    .eq("shop_id", shopId)
    .maybeSingle();

  const bookings = (bookingsData as unknown as B[]) ?? [];
  const total = bookings.length;
  const done = bookings.filter(
    (b) => b.status === "completed" || b.status === "paid",
  );
  const spent = done.reduce((s, b) => s + (b.price_snapshot ?? 0), 0);

  const formatPrice = (amount: number) => {
    if (!currency) return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
    return `${Math.round(amount).toLocaleString('ru-RU')} ${currency.symbol}`;
  };

  const fullName =
    [client.first_name, client.last_name].filter(Boolean).join(" ").trim() ||
    (client.phone ? `Гость: ${client.phone}` : "Без имени");

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Link
        href="/clients"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft size={15} /> Все клиенты
      </Link>

      {/* Заголовок с бейджем (без иконок) */}
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
          {fullName}
        </h1>
        {client.is_guest ? (
          <span className="inline-flex rounded-md bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
            Гость
          </span>
        ) : (
          <span className="inline-flex rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
            Telegram
          </span>
        )}
      </div>

      {/* Контакты — без @guest_xxx для гостей */}
      <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-neutral-500">
        {client.phone && <span>{client.phone}</span>}
        {!client.is_guest && client.username && (
          <span className="text-neutral-400">@{client.username}</span>
        )}
        <span className="text-neutral-400">
          с {fmtDateTime(client.created_at)}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Всего записей" value={String(total)} />
        <Stat label="Завершено/оплачено" value={String(done.length)} />
        <Stat label="Потрачено" value={formatPrice(spent)} />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-pink-200 bg-pink-50 p-4">
        <div>
          <div className="text-xs text-pink-500">Баллы лояльности</div>
          <div className="mt-1 text-xl font-semibold text-pink-700">{points} б.</div>
        </div>
        <div className="text-right text-xs text-pink-500">
          начислено {Number(loyalty?.total_earned ?? 0)} · потрачено{" "}
          {Number(loyalty?.total_spent ?? 0)}
        </div>
      </div>

      {seg && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                seg.segment === "new" ? "bg-emerald-100 text-emerald-700" :
                seg.segment === "regular" ? "bg-blue-100 text-blue-700" :
                seg.segment === "sleeping" ? "bg-amber-100 text-amber-700" :
                seg.segment === "lost" ? "bg-red-100 text-red-600" :
                "bg-neutral-100 text-neutral-500"
              }`}
            >
              {seg.segment === "new" ? "Новый" :
               seg.segment === "regular" ? "Постоянный" :
               seg.segment === "sleeping" ? "Спящий" :
               seg.segment === "lost" ? "Потерянный" :
               "Без визитов"}
            </span>
            <span className="text-xs text-neutral-500">
              {seg.last_visit
                ? `последний визит ${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(seg.last_visit))} (${seg.days_since_last} дн. назад)`
                : "ещё не приходил"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">
              {seg.retention_notified_at
                ? `напоминание отправлено ${new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(seg.retention_notified_at))}`
                : "напоминание ещё не отправлялось"}
            </span>
            {(seg.segment === "sleeping" || seg.segment === "lost") && (
              <RetentionResetButton
                clientId={parseInt(id)}
                alreadySent={!!seg.retention_notified_at}
                shopModules={shopModules}
              />
            )}
          </div>
        </div>
      )}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-neutral-900">
        История записей
      </h2>
      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-12 text-center text-sm text-neutral-500">
          Записей нет.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {bookings.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-28 shrink-0 text-neutral-500">
                {fmtDateTime(b.starts_at)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-neutral-800">
                  {b.service?.name ?? "—"}
                </div>
                <div className="truncate text-xs text-neutral-400">
                  {b.specialist?.full_name ?? "—"}
                </div>
              </div>
              <StatusSelect bookingId={b.id} status={b.status} />
              <span className="w-20 shrink-0 text-right text-neutral-600">
                {formatPrice(b.price_snapshot)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}