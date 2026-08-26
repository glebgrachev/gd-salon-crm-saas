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

  if (!firstName || !phone || !shopId) {
    return json({ error: "firstName, phone и shopId обязательны" }, 400);
  }

  const admin = createAdmin();

  // 1. Проверяем, не существует ли уже клиент с таким телефоном
  const { data: existing } = await admin
    .from("users")
    .select("telegram_id, is_guest")
    .eq("phone", phone)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (existing) {
    return json({ 
      ok: true, 
      clientId: existing.telegram_id,
      message: "Клиент уже существует" 
    });
  }

  // 2. Генерируем ID для гостя
  const guestId = generateGuestTelegramId(phone, shopId);

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
    console.error("❌ Ошибка создания гостя:", error);
    return json({ error: "Не удалось создать клиента" }, 500);
  }

  return json({ 
    ok: true, 
    clientId: newUser.telegram_id 
  });
}