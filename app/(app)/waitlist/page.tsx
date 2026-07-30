import { createClient } from "@/lib/supabase/server";
import WaitlistClient, { type WaitRow } from "./waitlist-client";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем данные ТОЛЬКО для этого салона
  const { data } = await supabase
    .from("v_waitlist")
    .select("*")
    .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
    .order("status", { ascending: false })   // offered выше waiting
    .order("created_at");

  return <WaitlistClient rows={(data as WaitRow[]) ?? []} />;
}