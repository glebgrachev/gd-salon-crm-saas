"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdmin } from "@/lib/supabase/admin";

export async function previewRecipients(segments: string[]) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) return { ok: false, error: "Нет доступа" };

  const validSegs = new Set(["new", "regular", "sleeping", "lost", "no_visits", "all"]);
  const segs = segments.filter((s) => validSegs.has(s));
  if (segs.length === 0) return { ok: true, count: 0 };

  const admin = createAdmin();
  const { data, error } = await admin.rpc("broadcast_recipients_for_segments", { p_segments: segs });
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: ((data as { client_id: number }[]) ?? []).length };
}
