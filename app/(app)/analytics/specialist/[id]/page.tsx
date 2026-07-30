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
import { Donut, BarList, Card, Kpi, type BarItem, type Slice } from "../../charts";

export const dynamic = "force-dynamic";

type Cat = { id: string; parent_id: string | null; name: string };
type Row = {
  price_snapshot: number | null;
  final_price: number | null;
  service: { id: string; name: string; category_id: string } | null;
};

function rootName(categoryId: string | undefined, cats: Map<string, Cat>) {
  if (!categoryId) return "—";
  let cur: string | null = categoryId;
  let g = 0;
  let last: Cat | null = null;
  while (cur && g++ < 10) {
    const c = cats.get(cur);
    if (!c) break;
    last = c;
    cur = c.parent_id;
  }
  return last?.name ?? "—";
}

export default async function SpecialistAnalytics({
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

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Проверяем, что специалист принадлежит этому салону
  const { data: specialist } = await supabase
    .from("specialists")
    .select("full_name, shop_id")
    .eq("id", id)
    .maybeSingle();

  if (!specialist) notFound();

  if (specialist.shop_id !== shopId) {
    notFound();
  }

  // 3. Загружаем данные только для этого салона
  const [{ data: rows }, { data: cats }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "price_snapshot, final_price, shop_id, service:services ( id, name, category_id )",
      )
      .eq("specialist_id", id)
      .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
      .gte("starts_at", fromISO)
      .lt("starts_at", toISO)
      .in("status", ["completed", "paid"]),
    supabase.from("categories").select("id, parent_id, name"),
  ]);

  const catMap = new Map<string, Cat>(((cats as Cat[]) ?? []).map((c) => [c.id, c]));
  const data = (rows as unknown as Row[]) ?? [];
  const val = (r: Row) => r.final_price ?? r.price_snapshot ?? 0;

  let revenue = 0;
  const bySvc = new Map<string, { name: string; count: number; sum: number }>();
  const byCat = new Map<string, { count: number; sum: number }>();
  for (const r of data) {
    const v = val(r);
    revenue += v;
    if (r.service) {
      const x = bySvc.get(r.service.id) ?? { name: r.service.name, count: 0, sum: 0 };
      x.count++; x.sum += v; bySvc.set(r.service.id, x);
    }
    const cn = rootName(r.service?.category_id, catMap);
    const c = byCat.get(cn) ?? { count: 0, sum: 0 };
    c.count++; c.sum += v; byCat.set(cn, c);
  }
  const count = data.length;
  const avg = count ? Math.round(revenue / count) : 0;

  const catSlices: Slice[] = [...byCat.entries()]
    .map(([name, v]) => ({ label: name, value: v.sum }))
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: colorAt(i) }));

  const svcItems: BarItem[] = [...bySvc.entries()]
    .map(([sid, v]) => ({ sid, ...v }))
    .sort((a, b) => b.sum - a.sum)
    .map((s, i) => ({
      label: s.name,
      value: s.sum,
      meta: `${s.count}`,
      color: colorAt(i),
      href: `/analytics/service/${s.sid}${qs}`,
    }));
  const maxSvc = Math.max(1, ...svcItems.map((x) => x.value));

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
          {specialist.full_name}
        </h1>
        <p className="mt-1 mb-4 text-sm text-neutral-500">
          Аналитика по мастеру за период.
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
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Выручка по категориям">
            <Donut items={catSlices} />
          </Card>
          <Card title="По услугам">
            <BarList items={svcItems} max={maxSvc} />
          </Card>
        </div>
      )}
    </div>
  );
}