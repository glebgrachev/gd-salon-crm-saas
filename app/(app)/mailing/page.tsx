// app/(app)/mailing/page.tsx

import { createClient } from "@/lib/supabase/server";
import MailingClient from "./mailing-client";

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

  // 4. 👇 СЧИТАЕМ ТОЛЬКО РЕАЛЬНЫХ ПОЛЬЗОВАТЕЛЕЙ (НЕ ГОСТЕЙ)
  // Получаем всех пользователей салона, исключая гостей
  const { data: allUsers } = await supabase
    .from("users")
    .select("telegram_id, promo_opt_out, is_guest")
    .eq("shop_id", shopId)
    .eq("is_guest", false)  // 👈 Исключаем гостей
    .not("telegram_id", "is", null); // 👈 Только с Telegram

  // Фильтруем по promo_opt_out
  const realUsers = allUsers?.filter(u => u.promo_opt_out === false) || [];
  const totalUsers = realUsers.length;

  // 5. Получаем сегменты только для реальных пользователей
  const { data: segments } = await supabase
    .from("v_client_segments")
    .select("client_id, segment")
    .eq("shop_id", shopId);

  // 6. Формируем segmentCounts
  const segmentCounts: Record<string, number> = {
    all: totalUsers,
    new: 0,
    regular: 0,
    sleeping: 0,
    lost: 0,
    no_visits: 0,
  };

  // Фильтруем сегменты: только для реальных пользователей
  const realUserIds = new Set(realUsers.map(u => u.telegram_id));
  
  (segments || []).forEach((s: any) => {
    // Проверяем, что пользователь реальный (не гость)
    if (realUserIds.has(s.client_id)) {
      const seg = s.segment || "no_visits";
      if (seg in segmentCounts && seg !== 'all') {
        segmentCounts[seg as keyof typeof segmentCounts] = (segmentCounts[seg as keyof typeof segmentCounts] || 0) + 1;
      }
    }
  });

  console.log('📊 MailingPage: segmentCounts =', segmentCounts);
  console.log('📊 MailingPage: realUsers =', realUsers.length);

  return (
    <MailingClient 
      history={history ?? []} 
      segmentCounts={segmentCounts}
      shopId={shopId}
    />
  );
}