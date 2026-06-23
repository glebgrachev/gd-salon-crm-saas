import { createClient } from "@/lib/supabase/server";
import SpecialistsManager, { type Specialist } from "./specialists-manager";

export const dynamic = "force-dynamic";

export default async function SpecialistsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("specialists")
    .select("id, full_name, photo_url, bio, experience_years, rating, is_active")
    .order("sort_order")
    .order("created_at");

  return <SpecialistsManager initial={(data as Specialist[]) ?? []} />;
}
