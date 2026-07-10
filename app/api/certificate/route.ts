import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

// GET — сертификатный баланс клиента + последние операции.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const user = validateInitData(url.searchParams.get("initData") ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();
  const [acc, tx] = await Promise.all([
    admin.from("certificate_accounts").select("balance").eq("client_id", user.id).maybeSingle(),
    admin
      .from("certificate_transactions")
      .select("kind, amount, note, created_at")
      .eq("client_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return json({
    ok: true,
    balance: Number(acc.data?.balance ?? 0),
    transactions: tx.data ?? [],
  });
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
