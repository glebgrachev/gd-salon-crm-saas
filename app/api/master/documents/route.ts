import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

type Row = {
  id: string;
  doc_type: string;
  title: string;
  file_path: string;
  expires_at: string | null;
  expiry_status: string;
  days_left: number | null;
};

export async function POST(req: Request) {
  let body: {
    initData?: string;
    shop_id?: string;
  };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = body.shop_id;
  if (!shopId) {
    console.error('❌ shop_id не передан');
    return json({ error: "shop_id_required" }, 400);
  }

  const admin = createAdmin();

  // ===== 2. ПОЛУЧАЕМ ТОКЕН БОТА ИЗ ТАБЛИЦЫ shops =====
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token")
    .eq("id", Number(shopId))
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error('❌ Токен для салона не найден:', shopId);
    return json({ error: "bot_token_not_found" }, 500);
  }

  // ===== 3. ПРОВЕРЯЕМ initData С ТОКЕНОМ САЛОНА =====
  const user = validateInitData(body.initData ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data: me } = await admin.rpc("whoami_specialist", { p_telegram: user.id });
  const spec = (me as { ok?: boolean; specialist_id?: string } | null);
  if (!spec?.ok || !spec.specialist_id) return json({ error: "not_linked" }, 403);

  const { data } = await admin
    .from("v_specialist_documents")
    .select("id, doc_type, title, file_path, expires_at, expiry_status, days_left")
    .eq("specialist_id", spec.specialist_id)
    .order("created_at", { ascending: false });

  const rows = (data as Row[]) ?? [];
  if (rows.length === 0) return json({ ok: true, documents: [] });

  const { data: signed } = await admin.storage
    .from("docs")
    .createSignedUrls(rows.map((r) => r.file_path), 3600);

  const urlMap = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
  }

  return json({
    ok: true,
    documents: rows.map((r) => ({
      id: r.id,
      doc_type: r.doc_type,
      title: r.title,
      expires_at: r.expires_at,
      expiry_status: r.expiry_status,
      days_left: r.days_left,
      url: urlMap.get(r.file_path) ?? null,
    })),
  });
}