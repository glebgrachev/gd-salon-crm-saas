import { createClient } from "@/lib/supabase/server";
import PromotionsManager, {
  type Promotion,
  type TargetOption,
} from "./promotions-manager";

export const dynamic = "force-dynamic";

type Cat = { id: string; parent_id: string | null; name: string };
type Svc = { id: string; name: string; category_id: string };

function buildPath(categoryId: string, cats: Map<string, Cat>): string {
  const parts: string[] = [];
  let cur: string | null = categoryId;
  let guard = 0;
  while (cur && guard++ < 10) {
    const c = cats.get(cur);
    if (!c) break;
    parts.unshift(c.name);
    cur = c.parent_id;
  }
  return parts.join(" › ");
}

export default async function PromotionsPage() {
  const supabase = await createClient();

  const [{ data: promos }, { data: cats }, { data: svcs }] = await Promise.all([
    supabase
      .from("promotions")
      .select(
        "id, title, description, banner_url, discount_type, discount_value, target_category_id, target_service_id, valid_from, valid_to, is_active",
      )
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, parent_id, name"),
    supabase.from("services").select("id, name, category_id").order("name"),
  ]);

  const catMap = new Map<string, Cat>(((cats as Cat[]) ?? []).map((c) => [c.id, c]));

  const categoryOptions: TargetOption[] = ((cats as Cat[]) ?? []).map((c) => ({
    kind: "category",
    id: c.id,
    label: buildPath(c.id, catMap),
  }));
  const serviceOptions: TargetOption[] = ((svcs as Svc[]) ?? []).map((s) => ({
    kind: "service",
    id: s.id,
    label: buildPath(s.category_id, catMap) + " › " + s.name,
  }));

  return (
    <PromotionsManager
      initial={(promos as Promotion[]) ?? []}
      categoryOptions={categoryOptions}
      serviceOptions={serviceOptions}
    />
  );
}
