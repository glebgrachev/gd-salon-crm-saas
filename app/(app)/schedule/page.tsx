import { createClient } from "@/lib/supabase/server";
import ScheduleClient, { type SpecOption } from "./schedule-client";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем специалистов ТОЛЬКО для этого салона
  const { data } = await supabase
    .from("specialists")
    .select("id, full_name, photo_url")
    .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
    .order("full_name");

  return <ScheduleClient specialists={(data as SpecOption[]) ?? []} />;
}