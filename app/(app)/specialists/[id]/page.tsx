import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScheduleEditor, {
  type Schedule,
  type Exception,
} from "./schedule-editor";

export const dynamic = "force-dynamic";

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

  const [{ data: schedules }, { data: exceptions }] = await Promise.all([
    supabase
      .from("specialist_schedules")
      .select("weekday, is_working, start_time, end_time, break_start, break_end")
      .eq("specialist_id", id),
    supabase
      .from("schedule_exceptions")
      .select("id, date, is_working, start_time, end_time, break_start, break_end")
      .eq("specialist_id", id)
      .order("date"),
  ]);

  return (
    <ScheduleEditor
      specialist={specialist}
      schedules={(schedules as Schedule[]) ?? []}
      exceptions={(exceptions as Exception[]) ?? []}
    />
  );
}
