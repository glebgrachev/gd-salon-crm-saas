import { createClient } from "@/lib/supabase/server";
import ScheduleClient, { type SpecOption } from "./schedule-client";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("specialists")
    .select("id, full_name, photo_url")
    .order("full_name");

  return <ScheduleClient specialists={(data as SpecOption[]) ?? []} />;
}
