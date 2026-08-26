import { createAdmin } from "@/lib/supabase/admin";
import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json();
  const { clientId, serviceId, specialistId, startsAt, shopId } = body;

  if (!clientId || !serviceId || !specialistId || !startsAt || !shopId) {
    return json({ error: "Все поля обязательны" }, 400);
  }

  const admin = createAdmin();

  // Проверяем, что клиент существует
  const { data: client, error: clientError } = await admin
    .from("users")
    .select("telegram_id")
    .eq("telegram_id", clientId)
    .eq("shop_id", Number(shopId))
    .maybeSingle();

  if (clientError || !client) {
    return json({ error: "Клиент не найден" }, 404);
  }

  // Проверяем, что услуга существует
  const { data: service, error: serviceError } = await admin
    .from("services")
    .select("id, duration_min")
    .eq("id", serviceId)
    .eq("shop_id", Number(shopId))
    .maybeSingle();

  if (serviceError || !service) {
    return json({ error: "Услуга не найдена" }, 404);
  }

  // Вычисляем ends_at
  const startsAtDate = new Date(startsAt);
  const endsAtDate = new Date(startsAtDate.getTime() + service.duration_min * 60 * 1000);

  // Создаём запись
  const { data: booking, error } = await admin
    .from("bookings")
    .insert({
      client_id: clientId,
      service_id: serviceId,
      specialist_id: specialistId,
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      shop_id: Number(shopId),
      status: "new",
      is_synthetic: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("❌ Ошибка создания записи:", error);
    return json({ error: "Не удалось создать запись" }, 500);
  }

  return json({ ok: true, booking });
}