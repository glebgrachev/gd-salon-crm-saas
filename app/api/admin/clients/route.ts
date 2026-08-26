import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function generateGuestTelegramId(phone: string, shopId: number): number {
  const cleanPhone = phone.replace(/\D/g, '');
  const str = `${shopId}:${cleanPhone}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return -Math.abs(hash);
}

export async function POST(req: Request) {
  const body = await req.json();
  const { firstName, lastName, phone, shopId } = body;

  console.log('📥 API: Получен запрос на создание клиента:', { firstName, lastName, phone, shopId });

  if (!firstName || !phone || !shopId) {
    console.log('❌ API: Ошибка валидации');
    return json({ error: "firstName, phone и shopId обязательны" }, 400);
  }

  const admin = createAdmin();

  // 1. Проверяем, не существует ли уже клиент с таким телефоном
  const { data: existing, error: findError } = await admin
    .from("users")
    .select("telegram_id, first_name, last_name, is_guest, phone")
    .eq("phone", phone)
    .eq("shop_id", shopId)
    .maybeSingle();

  console.log('🔍 API: Результат поиска пользователя:', { existing, findError });

  if (existing) {
    console.log('⚠️ API: Клиент уже существует:', existing);
    // ⚠️ Возвращаем ошибку дубликата с кодом 409
    return json({ 
      ok: false, 
      error: "duplicate",
      message: `Клиент с номером ${phone} уже существует`,
      client: {
        id: existing.telegram_id,
        name: [existing.first_name, existing.last_name].filter(Boolean).join(" "),
        is_guest: existing.is_guest
      }
    }, 409);
  }

  // 2. Генерируем ID для гостя
  const guestId = generateGuestTelegramId(phone, shopId);
  console.log('🔑 API: Сгенерирован ID для гостя:', guestId);

  // 3. Создаём гостя
  const { data: newUser, error } = await admin
    .from("users")
    .insert({
      telegram_id: guestId,
      first_name: firstName,
      last_name: lastName || '',
      phone: phone,
      shop_id: shopId,
      is_guest: true,
      username: `guest_${phone.replace(/\D/g, '').slice(-4)}`,
    })
    .select("telegram_id")
    .single();

  if (error) {
    console.error("❌ API: Ошибка создания гостя:", error);
    return json({ error: "Не удалось создать клиента" }, 500);
  }

  console.log('✅ API: Клиент успешно создан:', newUser);

  return json({ 
    ok: true, 
    clientId: newUser.telegram_id 
  });
}