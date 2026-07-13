import { createClient } from "@/lib/supabase/server";
import WaitlistClient, { type WaitRow } from "./waitlist-client";

export const dynamic = "force-dynamic";

export default async function WaitlistPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("v_waitlist")
    .select("*")
    .order("status", { ascending: false })   // offered выше waiting
    .order("created_at");

  return <WaitlistClient rows={(data as WaitRow[]) ?? []} />;
}
