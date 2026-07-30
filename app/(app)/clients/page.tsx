import { createClient } from "@/lib/supabase/server";
import ClientsClient, { type ClientRow } from "./clients-client";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
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
  const [{ data: users }, { data: bookings }, { data: segments }] = await Promise.all([
    supabase
      .from("users")
      .select("telegram_id, first_name, last_name, username, phone, created_at")
      .eq("shop_id", shopId) // 👈 КЛЮЧЕВОЙ ФИЛЬТР
      .order("created_at", { ascending: false }),
    supabase
      .from("bookings")
      .select("client_id, status, price_snapshot")
      .eq("shop_id", shopId), // 👈 ФИЛЬТР ПО САЛОНУ
    supabase
      .from("v_client_segments")
      .select("client_id, segment, last_visit, days_since_last, visits")
      .eq("shop_id", shopId), // 👈 ФИЛЬТР ПО САЛОНУ
  ]);

  const stats = new Map<number, { count: number; spent: number }>();
  for (const b of (bookings as { client_id: number; status: string; price_snapshot: number | null }[]) ?? []) {
    const s = stats.get(b.client_id) ?? { count: 0, spent: 0 };
    s.count++;
    if (b.status === "completed" || b.status === "paid")
      s.spent += b.price_snapshot ?? 0;
    stats.set(b.client_id, s);
  }

  const segMap = new Map<number, { segment: string; last_visit: string | null; days_since_last: number | null; visits: number }>();
  for (const s of (segments as { client_id: number; segment: string; last_visit: string | null; days_since_last: number | null; visits: number }[]) ?? []) {
    segMap.set(s.client_id, s);
  }

  const rows: ClientRow[] = ((users as Omit<ClientRow, "bookings" | "spent" | "segment" | "last_visit" | "days_since_last" | "paid_visits">[]) ?? []).map(
    (u) => {
      const seg = segMap.get(u.telegram_id);
      return {
        ...u,
        bookings: stats.get(u.telegram_id)?.count ?? 0,
        spent: stats.get(u.telegram_id)?.spent ?? 0,
        segment: seg?.segment ?? "no_visits",
        last_visit: seg?.last_visit ?? null,
        days_since_last: seg?.days_since_last ?? null,
        paid_visits: seg?.visits ?? 0,
      };
    },
  );

  return <ClientsClient initial={rows} />;
}