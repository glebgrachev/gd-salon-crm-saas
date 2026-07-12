import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleEditor from "./schedule-editor";
import SpecialistServices, {
  type CatalogService,
  type OfferedService,
} from "./specialist-services";
import SpecialistWorks, { type Work } from "./specialist-works";
import SpecialistPayouts, { type ServicePayout, type OfferedSvc } from "./specialist-payouts";
import SpecialistDocuments, { type SpecDocument } from "./specialist-documents";
import SpecialistAccess, { type AccessInfo } from "./specialist-access";
import ScheduleCalendar from "@/components/schedule-calendar";
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
    .select(
      "id, full_name, photo_url, experience_years, rating, payout_type, payout_value, salary_month, salary_mode, shift_rate, telegram_id, phone, link_code, link_code_expires_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (!specialist) notFound();

  const [
    { data: cats },
    { data: svcs },
    { data: offered },
    { data: works },
    { data: reviews },
  ] = await Promise.all([
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

  const [{ data: payoutOverrides }, { data: docs }] = await Promise.all([
    supabase
      .from("specialist_service_payouts")
      .select("service_id, payout_type, payout_value")
      .eq("specialist_id", id),
    supabase
      .from("v_specialist_documents")
      .select(
        "id, doc_type, title, file_path, mime_type, size_bytes, expires_at, is_public, created_at, expiry_status, days_left",
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

  // услуги, которые мастер реально оказывает — для исключений по оплате
  const svcNames = new Map<string, string>(((svcs as Svc[]) ?? []).map((s) => [s.id, s.name]));
  const offeredForPayouts: OfferedSvc[] = ((offered as OfferedService[]) ?? []).map((o) => ({
    service_id: o.service_id,
    name: svcNames.get(o.service_id) ?? "Услуга",
  }));

  return (
    <ScheduleEditor specialist={specialist}>
      <ScheduleCalendar specialistId={id} />
      <SpecialistServices
        specialistId={id}
        catalog={catalog}
        offered={(offered as OfferedService[]) ?? []}
      />
      <SpecialistPayouts
        specialistId={id}
        rules={{
          payout_type: (specialist.payout_type ?? "percent") as "percent" | "fixed",
          payout_value: Number(specialist.payout_value ?? 0),
          salary_month: Number(specialist.salary_month ?? 0),
          salary_mode: (specialist.salary_mode ?? "by_days") as "full_month" | "by_days" | "by_shifts",
          shift_rate: Number(specialist.shift_rate ?? 0),
        }}
        overrides={(payoutOverrides as ServicePayout[]) ?? []}
        offered={offeredForPayouts}
      />
      <SpecialistAccess
        specialistId={id}
        access={{
          telegram_id: specialist.telegram_id ?? null,
          phone: specialist.phone ?? null,
          link_code: specialist.link_code ?? null,
          link_code_expires_at: specialist.link_code_expires_at ?? null,
        } as AccessInfo}
        botName="@beautyapp_salon_bot"
      />
      <SpecialistDocuments specialistId={id} documents={(docs as SpecDocument[]) ?? []} />
      <SpecialistWorks specialistId={id} works={(works as Work[]) ?? []} />
      <SpecialistReviews
        specialistId={id}
        reviews={(reviews as unknown as Review[]) ?? []}
      />
    </ScheduleEditor>
  );
}
