import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return options();
}

type Row = {
  id: string;
  doc_type: string;
  title: string;
  file_path: string;
  mime_type: string | null;
  expiry_status: string;
};

// GET /api/specialist-docs?id=<specialist_id>&shop_id=<shop_id>&initData=...
// Отдаёт только публичные и не истёкшие документы, ссылки — signed на 1 час.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const specialistId = url.searchParams.get("id");
  if (!specialistId) return json({ error: "bad_request" }, 400);

  // ===== 1. ПОЛУЧАЕМ shop_id ИЗ ЗАПРОСА =====
  const shopId = url.searchParams.get("shop_id");
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
  const user = validateInitData(url.searchParams.get("initData") ?? "", shop.bot_token);
  if (!user) return json({ error: "unauthorized" }, 401);

  const { data } = await admin
    .from("v_specialist_documents")
    .select("id, doc_type, title, file_path, mime_type, expiry_status")
    .eq("specialist_id", specialistId)
    .eq("is_public", true)
    .neq("expiry_status", "expired")
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

  const documents = rows
    .map((r) => ({
      id: r.id,
      doc_type: r.doc_type,
      title: r.title,
      mime_type: r.mime_type,
      url: urlMap.get(r.file_path) ?? null,
    }))
    .filter((d) => d.url != null);

  return json({ ok: true, documents });
}