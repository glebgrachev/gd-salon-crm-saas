import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleEditor, {
  type Schedule,
  type Exception,
} from "./schedule-editor";
import SpecialistServices, {
  type CatalogService,
  type OfferedService,
} from "./specialist-services";
import SpecialistWorks, { type Work } from "./specialist-works";
import SpecialistReviews, { type Review } from "./specialist-reviews";

export const dynamic = "force-dynamic";

type Cat = { id: string; parent_id: string | null; name: string };
type Svc = { id: string; name: string; category_id: string };

function buildPath(
  categoryId: string,
  cats: Map<string, Cat>,
): string {
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

export default async function SpecialistPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: specialist } = await supabase
    .from("specialists")
    .select("id, full_name, photo_url, experience_years, rating")
    .eq("id", id)
    .maybeSingle();

  if (!specialist) notFound();

  const [
    { data: schedules },
    { data: exceptions },
    { data: cats },
    { data: svcs },
    { data: offered },
    { data: works },
    { data: reviews },
  ] = await Promise.all([
    supabase
      .from("specialist_schedules")
      .select("weekday, is_working, start_time, end_time, break_start, break_end")
      .eq("specialist_id", id),
    supabase
      .from("schedule_exceptions")
      .select("id, date, is_working, start_time, end_time, break_start, break_end")
      .eq("specialist_id", id)
      .order("date"),
    supabase.from("categories").select("id, parent_id, name"),
    supabase.from("services").select("id, name, category_id").order("name"),
    supabase
      .from("specialist_services")
      .select("service_id, price")
      .eq("specialist_id", id),
    supabase
      .from("specialist_works")
      .select("id, image_url, caption")
      .eq("specialist_id", id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("reviews")
      .select(
        "id, specialist_rating, service_rating, comment, status, created_at, client:users ( first_name, last_name, username ), service:services ( name )",
      )
      .eq("specialist_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const catMap = new Map<string, Cat>(((cats as Cat[]) ?? []).map((c) => [c.id, c]));
  const catalog: CatalogService[] = ((svcs as Svc[]) ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    path: buildPath(s.category_id, catMap),
  }));

  return (
    <ScheduleEditor
      specialist={specialist}
      schedules={(schedules as Schedule[]) ?? []}
      exceptions={(exceptions as Exception[]) ?? []}
    >
      <SpecialistServices
        specialistId={id}
        catalog={catalog}
        offered={(offered as OfferedService[]) ?? []}
      />
      <SpecialistWorks specialistId={id} works={(works as Work[]) ?? []} />
      <SpecialistReviews
        specialistId={id}
        reviews={(reviews as unknown as Review[]) ?? []}
      />
    </ScheduleEditor>
  );
}
