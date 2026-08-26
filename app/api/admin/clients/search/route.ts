import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const shopId = url.searchParams.get("shopId");
  const exact = url.searchParams.get("exact") === "true";

  if (!shopId) {
    return json({ error: "shopId обязателен" }, 400);
  }

  const admin = createAdmin();

  let query = admin
    .from("users")
    .select("telegram_id, first_name, last_name, phone, is_guest")
    .eq("shop_id", Number(shopId));

  // Точный поиск по ID
  if (exact && !isNaN(Number(q))) {
    query = query.eq("telegram_id", Number(q));
  } 
  // Поиск по тексту
  else if (q.trim().length >= 2) {
    // Очищаем телефон от нецифровых символов для поиска
    const cleanPhone = q.replace(/\D/g, '');
    
    query = query.or(
      `first_name.ilike.%${q}%,` +
      `last_name.ilike.%${q}%,` +
      `phone.ilike.%${cleanPhone}%,` +
      `phone.ilike.%${q}%`
    );
  } else {
    return json({ ok: true, clients: [] });
  }

  const { data: clients, error } = await query.limit(20);

  if (error) {
    console.error("❌ Ошибка поиска клиентов:", error);
    return json({ error: "Ошибка поиска" }, 500);
  }

  // Сортируем: сначала точные совпадения по телефону
  const sorted = (clients || []).sort((a, b) => {
    const aPhone = a.phone?.replace(/\D/g, '') || '';
    const bPhone = b.phone?.replace(/\D/g, '') || '';
    const qClean = q.replace(/\D/g, '');
    
    // Точное совпадение телефона
    if (aPhone === qClean && bPhone !== qClean) return -1;
    if (bPhone === qClean && aPhone !== qClean) return 1;
    
    // Сортировка по имени
    const aName = `${a.first_name || ''} ${a.last_name || ''}`.trim();
    const bName = `${b.first_name || ''} ${b.last_name || ''}`.trim();
    return aName.localeCompare(bName, 'ru');
  });

  return json({ ok: true, clients: sorted });
}