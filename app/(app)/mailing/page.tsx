// app/(app)/mailing/page.tsx

import { createClient } from "@/lib/supabase/server";
import MailingClient from "./MailingClient";

export const dynamic = "force-dynamic";

export default async function MailingPage() {
  const supabase = await createClient();

  // 1. Получаем текущего пользователя
  const { data: { user } } = await supabase.auth.getUser();

  // 2. Получаем shop_id админа
  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  console.log('📊 MailingPage: shopId =', shopId);

  // 3. Получаем историю рассылок для этого салона
  const { data: history } = await supabase
    .from("broadcasts")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });

  // 4. 👇 СЧИТАЕМ РЕАЛЬНЫХ ПОЛЬЗОВАТЕЛЕЙ
  // Получаем всех пользователей салона
  const { data: allUsers } = await supabase
    .from("users")
    .select("telegram_id, promo_opt_out")
    .eq("shop_id", shopId);

  const totalUsers = allUsers?.filter(u => u.promo_opt_out === false).length || 0;

  // 5. Пытаемся получить сегменты из v_client_segments
  const { data: segments } = await supabase
    .from("v_client_segments")
    .select("segment, count")
    .eq("shop_id", shopId);

  // 6. Формируем segmentCounts
  const segmentCounts: Record<string, number> = {
    all: totalUsers, // 👈 Берем из реальных пользователей
    new: 0,
    regular: 0,
    sleeping: 0,
    lost: 0,
    no_visits: 0,
  };

  // Заполняем из v_client_segments если есть
  segments?.forEach((s: any) => {
    if (s.segment in segmentCounts && s.segment !== 'all') {
      segmentCounts[s.segment as keyof typeof segmentCounts] = Number(s.count) || 0;
    }
  });

  // Если сегментов нет, но есть пользователи - распределяем их
  if (totalUsers > 0 && segments?.length === 0) {
    // Все пользователи попадают в "Все"
    segmentCounts.all = totalUsers;
    // Можно также раскидать по сегментам если есть поле segment в users
    const { data: usersWithSegments } = await supabase
      .from("users")
      .select("segment")
      .eq("shop_id", shopId)
      .eq("promo_opt_out", false);
    
    usersWithSegments?.forEach((u: any) => {
      if (u.segment && u.segment in segmentCounts && u.segment !== 'all') {
        segmentCounts[u.segment as keyof typeof segmentCounts] = (segmentCounts[u.segment as keyof typeof segmentCounts] || 0) + 1;
      }
    });
  }

  console.log('📊 MailingPage: segmentCounts =', segmentCounts);

  return (
    <MailingClient 
      history={history ?? []} 
      segmentCounts={segmentCounts}
      shopId={shopId}
    />
  );
}