import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fmtPrice } from "@/lib/bookings";

export const dynamic = "force-dynamic";

const PERIODS: Record<string, { label: string; days: number }> = {
  week: { label: "Неделя", days: 7 },
  month: { label: "Месяц", days: 30 },
  quarter: { label: "Квартал", days: 90 },
  year: { label: "Год", days: 365 },
};

type Cat = { id: string; parent_id: string | null; name: string };
type Row = {
  status: string;
  price_snapshot: number | null;
  final_price: number | null;
  promo_id: string | null;
  discount_amount: number | null;
  specialist: { full_name: string } | null;
  service: { name: string; category_id: string } | null;
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

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
      <div className="h-full rounded-full bg-neutral-800" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const period = PERIODS[sp.period ?? "month"] ? (sp.period ?? "month") : "month";
  const days = PERIODS[period].days;
  const from = new Date(Date.now() - days * 86400000).toISOString();

  const supabase = await createClient();
  const [{ data: rows }, { data: cats }, { data: promos }] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "status, price_snapshot, final_price, promo_id, discount_amount, specialist:specialists ( full_name ), service:services ( name, category_id )",
      )
      .gte("starts_at", from)
      .in("status", ["completed", "paid"]),
    supabase.from("categories").select("id, parent_id, name"),
    supabase.from("promotions").select("id, title, kind, is_active"),
  ]);

  const catMap = new Map<string, Cat>(((cats as Cat[]) ?? []).map((c) => [c.id, c]));
  const data = (rows as unknown as Row[]) ?? [];

  const val = (r: Row) => r.final_price ?? r.price_snapshot ?? 0;

  let revenue = 0;
  const bySpec = new Map<string, { count: number; sum: number }>();
  const byCat = new Map<string, { count: number; sum: number }>();
  const bySvc = new Map<string, { count: number; sum: number }>();

  for (const r of data) {
    const v = val(r);
    revenue += v;
    const sp = r.specialist?.full_name ?? "—";
    const s = bySpec.get(sp) ?? { count: 0, sum: 0 };
    s.count++; s.sum += v; bySpec.set(sp, s);

    const root = rootCategory(r.service?.category_id, catMap);
    const cn = root?.name ?? "—";
    const c = byCat.get(cn) ?? { count: 0, sum: 0 };
    c.count++; c.sum += v; byCat.set(cn, c);

    const sv = r.service?.name ?? "—";
    const x = bySvc.get(sv) ?? { count: 0, sum: 0 };
    x.count++; x.sum += v; bySvc.set(sv, x);
  }

  const count = data.length;
  const avg = count ? Math.round(revenue / count) : 0;

  // по акциям
  const byPromo = new Map<string, { count: number; revenue: number; discount: number }>();
  for (const r of data) {
    if (!r.promo_id) continue;
    const p = byPromo.get(r.promo_id) ?? { count: 0, revenue: 0, discount: 0 };
    p.count++;
    p.revenue += val(r);
    p.discount += r.discount_amount ?? 0;
    byPromo.set(r.promo_id, p);
  }
  const promoList = (promos as { id: string; title: string; kind: string; is_active: boolean }[]) ?? [];
  const promoRows = promoList
    .map((p) => ({
      title: p.title,
      kind: p.kind,
      is_active: p.is_active,
      ...(byPromo.get(p.id) ?? { count: 0, revenue: 0, discount: 0 }),
    }))
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count);
  const maxPromo = Math.max(1, ...promoRows.map((x) => x.revenue));

  const sort = (m: Map<string, { count: number; sum: number }>) =>
    [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.sum - a.sum);
  const specs = sort(bySpec);
  const catsArr = sort(byCat);
  const svcs = sort(bySvc);
  const maxSpec = Math.max(1, ...specs.map((x) => x.sum));
  const maxCat = Math.max(1, ...catsArr.map((x) => x.sum));
  const maxSvc = Math.max(1, ...svcs.map((x) => x.sum));

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Аналитика</h1>
          <p className="mt-1 text-sm text-neutral-500">
            По завершённым и оплаченным записям за период.
          </p>
        </div>
        <div className="flex gap-1">
          {Object.entries(PERIODS).map(([key, p]) => (
            <Link
              key={key}
              href={`/analytics?period=${key}`}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                period === key
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Выручка" value={fmtPrice(revenue)} />
        <Kpi label="Приёмов" value={String(count)} />
        <Kpi label="Средний чек" value={fmtPrice(avg)} />
      </div>

      {count === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-16 text-center text-sm text-neutral-500">
          За выбранный период нет завершённых или оплаченных записей.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Block title="По мастерам" rows={specs} max={maxSpec} />
          <Block title="По категориям" rows={catsArr} max={maxCat} />
          <div className="lg:col-span-2">
            <Block title="По услугам" rows={svcs} max={maxSvc} />
          </div>
        </div>
      )}

      {promoRows.length > 0 && (
        <div className="mt-6">
          <PromoBlock rows={promoRows} max={maxPromo} />
        </div>
      )}
    </div>
  );
}

function PromoBlock({
  rows,
  max,
}: {
  rows: { title: string; kind: string; is_active: boolean; count: number; revenue: number; discount: number }[];
  max: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">По акциям</h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.title} className={r.count === 0 ? "opacity-50" : ""}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-neutral-700">{r.title}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                    r.kind === "gift"
                      ? "bg-violet-100 text-violet-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {r.kind === "gift" ? "комплекс" : "скидка"}
                </span>
              </span>
              {r.count === 0 ? (
                <span className="shrink-0 text-xs text-neutral-400">
                  не применялась
                </span>
              ) : (
                <span className="shrink-0 font-medium text-neutral-900">
                  {fmtPrice(r.revenue)}
                  <span className="ml-2 text-xs font-normal text-neutral-400">
                    {r.count} · скидка {fmtPrice(r.discount)}
                  </span>
                </span>
              )}
            </div>
            <Bar value={r.revenue} max={max} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-neutral-900">{value}</div>
    </div>
  );
}

function Block({
  title,
  rows,
  max,
}: {
  title: string;
  rows: { name: string; count: number; sum: number }[];
  max: number;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.name}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate text-neutral-700">{r.name}</span>
              <span className="shrink-0 font-medium text-neutral-900">
                {fmtPrice(r.sum)}
                <span className="ml-2 text-xs font-normal text-neutral-400">
                  {r.count}
                </span>
              </span>
            </div>
            <Bar value={r.sum} max={max} />
          </li>
        ))}
      </ul>
    </div>
  );
}
