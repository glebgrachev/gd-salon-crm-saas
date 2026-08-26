import { json } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const shopId = url.searchParams.get("shopId");
  const specialist = url.searchParams.get("specialist");
  const service = url.searchParams.get("service");
  const date = url.searchParams.get("date");

  if (!shopId || !specialist || !service || !date) {
    return json({ error: "Недостаточно параметров" }, 400);
  }

  try {
    // Формируем URL для внутреннего API day-slots
    const apiUrl = new URL(`${process.env.API_URL}/api/day-slots`);
    apiUrl.searchParams.set("shop_id", shopId);
    apiUrl.searchParams.set("specialist", specialist);
    apiUrl.searchParams.set("service", service);
    apiUrl.searchParams.set("date", date);
    // Для админки передаём пустой initData
    apiUrl.searchParams.set("initData", "");

    console.log("🔍 [Admin] Запрос слотов:", apiUrl.toString());

    const response = await fetch(apiUrl.toString(), {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("❌ [Admin] Ошибка получения слотов:", response.status);
      return json({ error: "Ошибка получения слотов" }, response.status);
    }

    const result = await response.json();
    return json({ ok: true, slots: result.slots || [] });
  } catch (error) {
    console.error("❌ [Admin] Ошибка получения слотов:", error);
    return json({ error: "Внутренняя ошибка сервера" }, 500);
  }
}