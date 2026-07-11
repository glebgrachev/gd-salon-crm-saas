import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

const CANCEL_THRESHOLD_MS = 3 * 3600_000; // отмена доступна не позже чем за 3 часа
const ACTIVE = ["new", "confirmed", "paid"];

type Row = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  rescheduling_started_at: string | null;
  is_synthetic: boolean | null;
  service: { name: string } | null;
  specialist: { full_name: string } | null;
};

export async function POST(req: Request) {
  let body: { initData?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();

  const [{ data: rows }, { data: cfg }] = await Promise.all([
    admin
      .from("bookings")
      .select(
        "id, status, starts_at, ends_at, rescheduling_started_at, is_synthetic, service:services ( name ), specialist:specialists ( full_name )",
      )
      .eq("client_id", user.id)
      .order("starts_at", { ascending: false })
      .limit(100),
    admin.from("reschedule_settings").select("min_hours_before").eq("id", 1).maybeSingle(),
  ]);

  const minHoursBefore = Number(cfg?.min_hours_before ?? 2);
  const RESCHEDULE_THRESHOLD_MS = minHoursBefore * 3600_000;

  // какие брони уже имеют отзыв
  const ids = ((rows as unknown as Row[]) ?? []).map((r) => r.id);
  const reviewed = new Set<string>();
  if (ids.length) {
    const { data: revs } = await admin.from("reviews").select("booking_id").in("booking_id", ids);
    for (const r of (revs as { booking_id: string }[]) ?? []) reviewed.add(r.booking_id);
  }

  const now = Date.now();
  const upcoming: unknown[] = [];
  const past: unknown[] = [];

  for (const b of (rows as unknown as Row[]) ?? []) {
    const startMs = new Date(b.starts_at).getTime();
    const endMs = new Date(b.ends_at).getTime();
    const item = {
      id: b.id,
      status: b.status,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      service: b.service?.name ?? "Услуга",
      specialist: b.specialist?.full_name ?? "",
      can_cancel: ACTIVE.includes(b.status) && startMs - now >= CANCEL_THRESHOLD_MS,
      can_reschedule:
        b.status === "new" &&
        !b.is_synthetic &&
        b.rescheduling_started_at == null &&
        startMs - now >= RESCHEDULE_THRESHOLD_MS,
      rescheduling: b.rescheduling_started_at != null,
      can_review: endMs <= now && b.status !== "cancelled" && b.status !== "no_show",
      reviewed: reviewed.has(b.id),
    };
    const isCancelled = b.status === "cancelled" || b.status === "no_show";
    if (!isCancelled && endMs > now) upcoming.push(item);
    else past.push(item);
  }

  // upcoming по возрастанию времени
  upcoming.sort((a, b) => +new Date((a as Row).starts_at) - +new Date((b as Row).starts_at));

  // активный перенос (если есть) — для баннера на главной
  const active = ((rows as unknown as Row[]) ?? []).find(
    (b) => b.rescheduling_started_at != null && b.status === "new",
  );

  return json({
    ok: true,
    upcoming,
    past,
    active_reschedule: active
      ? { booking_id: active.id, service: active.service?.name ?? "Услуга", starts_at: active.starts_at }
      : null,
  });
}
