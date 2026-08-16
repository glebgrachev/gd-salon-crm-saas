import { createClient } from "@/lib/supabase/server";
import MailingClient from "./mailing-client";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  segments: string[];
  text: string;
  cta_url: string | null;
  status: string;
  total: number;
  sent: number;
  failed: number;
  opted_out: number;
  created_at: string;
  finished_at: string | null;
};

export default async function MailingPage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем историю рассылок ТОЛЬКО для этого салона
  const [{ data: history }, { data: segs }] = await Promise.all([
    supabase
      .from("broadcasts")
      .select("id, segments, text, cta_url, status, total, sent, failed, opted_out, created_at, finished_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("v_client_segments")
      .select("segment")
      .eq("shop_id", shopId),
  ]);

  const counts = ((segs as { segment: string }[]) ?? []).reduce<Record<string, number>>((acc, s) => {
    acc[s.segment] = (acc[s.segment] ?? 0) + 1;
    return acc;
  }, {});
  counts.all = ((segs as { segment: string }[]) ?? []).length;

  return <MailingClient history={(history as Row[]) ?? []} segmentCounts={counts} />;
}