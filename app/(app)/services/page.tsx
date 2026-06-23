import { createClient } from "@/lib/supabase/server";
import ServicesManager, {
  type Category,
  type Service,
} from "./services-manager";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const supabase = await createClient();

  const [{ data: cats }, { data: svcs }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, parent_id, name, level, sort_order")
      .order("level")
      .order("sort_order")
      .order("name"),
    supabase
      .from("services")
      .select("id, category_id, name, duration_min")
      .order("name"),
  ]);

  return (
    <ServicesManager
      categories={(cats as Category[]) ?? []}
      services={(svcs as Service[]) ?? []}
    />
  );
}
