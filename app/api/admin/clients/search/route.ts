import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Функция для нормализации строки (как в приложении)
function normalize(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, ' ')        // множественные пробелы → один
    .replace(/[^а-яa-z0-9\s]/g, '') // убираем спецсимволы
    .trim();
}

// Функция для нормализации телефона
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, ''); // оставляем только цифры
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const shopId = url.searchParams.get("shopId");
  const exact = url.searchParams.get("exact") === "true";

  if (!shopId) {
    return json({ error: "shopId обязателен" }, 400);
  }

  console.log('🔍 Поиск:', { q, shopId, exact });

  const admin = createAdmin();

  // Если точный поиск по ID
  if (exact && !isNaN(Number(q))) {
    const { data, error } = await admin
      .from("users")
      .select("telegram_id, first_name, last_name, phone, is_guest")
      .eq("telegram_id", Number(q))
      .eq("shop_id", Number(shopId))
      .limit(1);

    if (error) {
      console.error("❌ Ошибка поиска по ID:", error);
      return json({ error: "Ошибка поиска" }, 500);
    }

    return json({ ok: true, clients: data || [] });
  }

  // Если запрос слишком короткий
  if (q.trim().length < 2) {
    return json({ ok: true, clients: [] });
  }

  // Нормализуем запрос для поиска
  const searchQuery = normalize(q);
  const phoneQuery = normalizePhone(q);

  console.log('🔍 Нормализованные данные:', { searchQuery, phoneQuery });

  // Загружаем всех клиентов салона
  const { data: allClients, error } = await admin
    .from("users")
    .select("telegram_id, first_name, last_name, phone, is_guest")
    .eq("shop_id", Number(shopId));

  if (error) {
    console.error("❌ Ошибка загрузки клиентов:", error);
    return json({ error: "Ошибка поиска" }, 500);
  }

  // Фильтруем на клиенте (как в приложении)
  const filtered = allClients.filter((client) => {
    // Нормализуем данные клиента
    const name = normalize(`${client.first_name || ''} ${client.last_name || ''}`);
    const phone = normalizePhone(client.phone || '');
    
    // Поиск по имени (частичное совпадение)
    if (searchQuery && name.includes(searchQuery)) {
      return true;
    }
    
    // Поиск по телефону (частичное совпадение)
    if (phoneQuery && phone.includes(phoneQuery)) {
      return true;
    }
    
    return false;
  });

  console.log('🔍 Найдено клиентов:', filtered.length);

  // Сортируем по релевантности
  const sorted = filtered.sort((a, b) => {
    const aName = normalize(`${a.first_name || ''} ${a.last_name || ''}`);
    const bName = normalize(`${b.first_name || ''} ${b.last_name || ''}`);
    const aPhone = normalizePhone(a.phone || '');
    const bPhone = normalizePhone(b.phone || '');
    
    // Точное совпадение телефона
    if (aPhone === phoneQuery && bPhone !== phoneQuery) return -1;
    if (bPhone === phoneQuery && aPhone !== phoneQuery) return 1;
    
    // Точное совпадение имени
    if (aName === searchQuery && bName !== searchQuery) return -1;
    if (bName === searchQuery && aName !== searchQuery) return 1;
    
    // Сортировка по имени
    return aName.localeCompare(bName, 'ru');
  });

  return json({ ok: true, clients: sorted.slice(0, 20) });
}