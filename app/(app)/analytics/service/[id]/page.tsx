import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtPrice } from "@/lib/bookings";
import {
  type PeriodType,
  parseAnchor,
  toAnchorStr,
  computeRange,
  colorAt,
} from "@/lib/analytics";
import PeriodPicker from "../../period-picker";
import { BarList, Card, Kpi, type BarItem } from "../../charts";

export const dynamic = "force-dynamic";

type Row = {
  price_snapshot: number | null;
  final_price: number | null;
  specialist: { id: string; full_name: string } | null;
};

export default async function ServiceAnalytics({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; date?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const type: PeriodType = (["week", "month", "quarter", "year"].includes(
    sp.type ?? "",
  )
    ? sp.type
    : "month") as PeriodType;
  const anchor = parseAnchor(sp.date);
  const dateStr = toAnchorStr(anchor);
  const { fromISO, toISO } = computeRange(type, anchor);
  const qs = `?type=${type}&date=${dateStr}`;

  const supabase = await createClient();
  const { data: service } = await supabase
    .from("services")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (!service) notFound();

  const { data: rows } = await supabase
    .from("bookings")
    .select("price_snapshot, final_price, specialist:specialists ( id, full_name )")
    .eq("service_id", id)
    .gte("starts_at", fromISO)
    .lt("starts_at", toISO)
    .in("status", ["completed", "paid"]);

  const data = (rows as unknown as Row[]) ?? [];
  const val = (r: Row) => r.final_price ?? r.price_snapshot ?? 0;

  let revenue = 0;
  const bySpec = new Map<string, { name: string; count: number; sum: number }>();
  for (const r of data) {
    const v = val(r);
    revenue += v;
    if (r.specialist) {
      const s = bySpec.get(r.specialist.id) ?? {
        name: r.specialist.full_name,
        count: 0,
        sum: 0,
      };
      s.count++; s.sum += v; bySpec.set(r.specialist.id, s);
    }
  }
  const count = data.length;
  const avg = count ? Math.round(revenue / count) : 0;

  const specItems: BarItem[] = [...bySpec.entries()]
    .map(([sid, v]) => ({ sid, ...v }))
    .sort((a, b) => b.sum - a.sum)
    .map((s, i) => ({
      label: s.name,
      value: s.sum,
      meta: `${s.count}`,
      color: colorAt(i),
      href: `/analytics/specialist/${s.sid}${qs}`,
    }));
  const maxSpec = Math.max(1, ...specItems.map((x) => x.value));

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <Link
        href={`/analytics${qs}`}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft size={15} /> Вся аналитика
      </Link>

      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          {service.name}
        </h1>
        <p className="mt-1 mb-4 text-sm text-neutral-500">
          Аналитика по услуге за период.
        </p>
        <PeriodPicker type={type} date={dateStr} />
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Выручка" value={fmtPrice(revenue)} accent="#8b5cf6" />
        <Kpi label="Приёмов" value={String(count)} accent="#3b82f6" />
        <Kpi label="Средний чек" value={fmtPrice(avg)} accent="#10b981" />
      </div>

      {count === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          Нет завершённых записей за период.
        </div>
      ) : (
        <div className="mt-6">
          <Card title="По мастерам">
            <BarList items={specItems} max={maxSpec} />
          </Card>
        </div>
      )}
    </div>
  );
}
