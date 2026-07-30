import { createClient } from "@/lib/supabase/server";
import { fmtPrice } from "@/lib/bookings";
import {
  type PeriodType,
  parseAnchor,
  toAnchorStr,
  computeRange,
  colorAt,
} from "@/lib/analytics";
import PeriodPicker from "./period-picker";
import { Donut, BarList, Card, Kpi, type BarItem, type Slice } from "./charts";

export const dynamic = "force-dynamic";

type Cat = { id: string; parent_id: string | null; name: string };
type Row = {
  promo_id: string | null;
  discount_amount: number | null;
  price_snapshot: number | null;
  final_price: number | null;
  specialist: { id: string; full_name: string } | null;
  service: { id: string; name: string; category_id: string } | null;
};

function rootCategory(categoryId: string | undefined, cats: Map<string, Cat>) {
  if (!categoryId) return null;
  let cur: string | null = categoryId;
  let guard = 0;
  let last: Cat | null = null;
  while (cur && guard++ < 10) {
    const c = cats.get(cur);
    if (!c) break;
    last = c;
    cur = c.parent_id;
  }
  return last;
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; date?: string }>;
}) {
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

  // 2. Загружаем данные только для этого салона
  const [{ data: rows }, { data: cats }, { data: promos }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "promo_id, discount_amount, price_snapshot, final_price, specialist:specialists ( id, full_name ), service:services ( id, name, category_id )",
      )
      .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
      .gte("starts_at", fromISO)
      .lt("starts_at", toISO)
      .in("status", ["completed", "paid"]),
    supabase.from("categories").select("id, parent_id, name"),
    supabase.from("promotions").select("id, title, kind"),
  ]);

  const catMap = new Map<string, Cat>(((cats as Cat[]) ?? []).map((c) => [c.id, c]));
  const data = (rows as unknown as Row[]) ?? [];
  const val = (r: Row) => r.final_price ?? r.price_snapshot ?? 0;

  let revenue = 0;
  const bySpec = new Map<string, { name: string; count: number; sum: number }>();
  const byCat = new Map<string, { count: number; sum: number }>();
  const bySvc = new Map<string, { name: string; count: number; sum: number }>();
  const byPromo = new Map<string, { count: number; revenue: number; discount: number }>();

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
    const root = rootCategory(r.service?.category_id, catMap);
    const cn = root?.name ?? "—";
    const c = byCat.get(cn) ?? { count: 0, sum: 0 };
    c.count++; c.sum += v; byCat.set(cn, c);

    if (r.service) {
      const x = bySvc.get(r.service.id) ?? {
        name: r.service.name,
        count: 0,
        sum: 0,
      };
      x.count++; x.sum += v; bySvc.set(r.service.id, x);
    }
    if (r.promo_id) {
      const p = byPromo.get(r.promo_id) ?? { count: 0, revenue: 0, discount: 0 };
      p.count++; p.revenue += v; p.discount += r.discount_amount ?? 0;
      byPromo.set(r.promo_id, p);
    }
  }

  const count = data.length;
  const avg = count ? Math.round(revenue / count) : 0;

  const catSlices: Slice[] = [...byCat.entries()]
    .map(([name, v]) => ({ label: name, value: v.sum }))
    .sort((a, b) => b.value - a.value)
    .map((s, i) => ({ ...s, color: colorAt(i) }));

  const specItems: BarItem[] = [...bySpec.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.sum - a.sum)
    .map((s, i) => ({
      label: s.name,
      value: s.sum,
      meta: `${s.count}`,
      color: colorAt(i),
      href: `/analytics/specialist/${s.id}${qs}`,
    }));
  const maxSpec = Math.max(1, ...specItems.map((x) => x.value));

  const svcItems: BarItem[] = [...bySvc.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.sum - a.sum)
    .map((s, i) => ({
      label: s.name,
      value: s.sum,
      meta: `${s.count}`,
      color: colorAt(i),
      href: `/analytics/service/${s.id}${qs}`,
    }));
  const maxSvc = Math.max(1, ...svcItems.map((x) => x.value));

  const promoList = (promos as { id: string; title: string; kind: string }[]) ?? [];
  const promoItems: BarItem[] = promoList
    .map((p, i) => {
      const a = byPromo.get(p.id) ?? { count: 0, revenue: 0, discount: 0 };
      return {
        label: p.title,
        value: a.revenue,
        valueLabel: a.count > 0 ? fmtPrice(a.revenue) : "не применялась",
        meta:
          a.count > 0 ? `${a.count} · скидка ${fmtPrice(a.discount)}` : undefined,
        color: p.kind === "gift" ? "#8b5cf6" : "#f43f5e",
        _sum: a.revenue,
      };
    })
    .sort((x, y) => (y as { _sum: number })._sum - (x as { _sum: number })._sum)
    .map(({ ...rest }) => rest as BarItem);
  const maxPromo = Math.max(1, ...promoItems.map((x) => x.value));

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Аналитика
        </h1>
        <p className="mt-1 mb-4 text-sm text-neutral-500">
          По завершённым и оплаченным записям за выбранный период.
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
          За выбранный период нет завершённых или оплаченных записей.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Выручка по категориям">
            <Donut items={catSlices} />
          </Card>
          <Card title="По мастерам">
            <BarList items={specItems} max={maxSpec} />
          </Card>
          <div className="lg:col-span-2">
            <Card title="По услугам">
              <BarList items={svcItems} max={maxSvc} />
            </Card>
          </div>
          {promoItems.length > 0 && (
            <div className="lg:col-span-2">
              <Card title="По акциям">
                <BarList items={promoItems} max={maxPromo} />
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}