import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

// GET — список сертификатов клиента (по отдельности) + общий остаток.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = validateInitData(url.searchParams.get("initData") ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data } = await admin
    .from("certificates")
    .select("id, code, balance, status, expires_at")
    .eq("activated_by", user.id)
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("activated_at", { ascending: true });

  type C = { id: string; code: string; balance: number; status: string; expires_at: string | null };
  const all = (data as C[]) ?? [];

  // доступны к оплате: активные, с остатком, не просроченные
  const certificates = all.map((c) => {
    const expired = c.status === "expired" || (c.expires_at != null && c.expires_at < today);
    const usable = c.status === "active" && Number(c.balance) > 0 && !expired;
    return {
      id: c.id,
      code: c.code,
      balance: Number(c.balance),
      status: expired && c.status === "active" ? "expired" : c.status,
      expires_at: c.expires_at,
      usable,
    };
  });

  const balance = certificates.filter((c) => c.usable).reduce((s, c) => s + c.balance, 0);

  return json({ ok: true, balance, certificates });
}

// POST — активация сертификата по коду. Тело: { initData, code }
export async function POST(req: Request) {
  let body: { initData?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  const code = (body.code ?? "").trim();
  if (!code) return json({ ok: false, error: "empty_code" }, 400);

  const admin = createAdmin();

  // на всякий случай убедимся, что пользователь есть в users (FK при активации)
  await admin.from("users").upsert(
    {
      telegram_id: user.id,
      first_name: user.first_name ?? null,
      last_name: user.last_name ?? null,
      username: user.username ?? null,
    },
    { onConflict: "telegram_id" },
  );

  const { data, error } = await admin.rpc("activate_certificate", { p_client: user.id, p_code: code });
  if (error) return json({ ok: false, error: error.message }, 500);

  const res = data as { ok: boolean; error?: string; added?: number; balance?: number };
  if (!res.ok) return json(res, 200); // ошибки бизнес-логики отдаём как есть (not_found и т.п.)
  return json(res);
}
