import { createClient } from "@/lib/supabase/server";
import SpecialistsManager, { type Specialist } from "./specialists-manager";

export const dynamic = "force-dynamic";

export default async function SpecialistsPage() {
  const supabase = await createClient();

  // 1. Получаем текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Получаем shop_id админа
  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  // 3. Загружаем ТОЛЬКО специалистов этого салона
  const { data } = await supabase
    .from("specialists")
    .select("id, full_name, photo_url, bio, experience_years, rating, is_active, shop_id")
    .eq("shop_id", admin?.shop_id ?? 0) // 👈 Фильтр по салону
    .order("sort_order")
    .order("created_at");

  return <SpecialistsManager initial={(data as Specialist[]) ?? []} />;
}