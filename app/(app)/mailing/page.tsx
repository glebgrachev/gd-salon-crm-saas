// app/(app)/mailing/page.tsx

import { createClient } from "@/lib/supabase/server";
import MailingClient from "./mailing-client"; // 👈 импорт с маленькой буквы

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

  // 4. Получаем количество клиентов по сегментам
  const { data: segments } = await supabase
    .from("v_client_segments")
    .select("segment, count")
    .eq("shop_id", shopId);

  const segmentCounts: Record<string, number> = {
    all: 0,
    new: 0,
    regular: 0,
    sleeping: 0,
    lost: 0,
    no_visits: 0,
  };

  segments?.forEach((s: any) => {
    if (s.segment in segmentCounts) {
      segmentCounts[s.segment as keyof typeof segmentCounts] = Number(s.count) || 0;
    }
  });

  // "Все" = сумма всех сегментов
  segmentCounts.all = Object.values(segmentCounts).reduce((a, b) => a + b, 0);

  return (
    <MailingClient 
      history={history ?? []} 
      segmentCounts={segmentCounts}
      shopId={shopId}
    />
  );
}