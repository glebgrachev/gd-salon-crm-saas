import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StatusSelect from "./status-select";
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

  const { data: client } = await supabase
    .from("users")
    .select("telegram_id, first_name, last_name, username, phone, created_at")
    .eq("telegram_id", id)
    .maybeSingle();

  if (!client) notFound();

  const { data: bookingsData } = await supabase
    .from("bookings")
    .select(
      "id, starts_at, status, price_snapshot, specialist:specialists ( full_name ), service:services ( name )",
    )
    .eq("client_id", id)
    .order("starts_at", { ascending: false });

  const { data: loyalty } = await supabase
    .from("loyalty_accounts")
    .select("balance, total_earned, total_spent")
    .eq("client_id", id)
    .maybeSingle();
  const points = Number(loyalty?.balance ?? 0);

  const bookings = (bookingsData as unknown as B[]) ?? [];
  const total = bookings.length;
  const done = bookings.filter(
    (b) => b.status === "completed" || b.status === "paid",
  );
  const spent = done.reduce((s, b) => s + (b.price_snapshot ?? 0), 0);

  const fullName =
    [client.first_name, client.last_name].filter(Boolean).join(" ").trim() ||
    (client.username ? "@" + client.username : "Без имени");

  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <Link
        href="/clients"
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft size={15} /> Все клиенты
      </Link>

      <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
        {fullName}
      </h1>
      <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-neutral-500">
        {client.username && <span>@{client.username}</span>}
        {client.phone && <span>{client.phone}</span>}
        <span className="text-neutral-400">
          с {fmtDateTime(client.created_at)}
        </span>
      </div>

      {/* аналитика */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <Stat label="Всего записей" value={String(total)} />
        <Stat label="Завершено/оплачено" value={String(done.length)} />
        <Stat label="Потрачено" value={fmtPrice(spent)} />
      </div>

      {/* баллы лояльности */}
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

      {/* история */}
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
                {fmtPrice(b.price_snapshot)}
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
