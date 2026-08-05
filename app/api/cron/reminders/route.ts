import { createAdmin } from "@/lib/supabase/admin";
import { tgSend, fmtMsk, fmtTimeMsk } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  client_id: number;
  starts_at: string;
  ends_at: string;
  service: { name: string } | null;
  specialist: { full_name: string } | null;
};

const SELECT =
  "id, client_id, starts_at, ends_at, service:services ( name ), specialist:specialists ( full_name )";

type Admin = ReturnType<typeof createAdmin>;
type Mark = "reminded_day_at" | "reminded_3h_at" | "review_requested_at";

/**
 * Помечает запись как обработанную ДО отправки сообщения.
 *
 * Условие `.is(field, null)` делает операцию идемпотентной: если два
 * запуска cron наложатся, метку поставит только первый — второй получит
 * пустой результат и не отправит дубль.
 *
 * Возвращает false, если пометить не удалось. Тогда сообщение НЕ шлём:
 * лучше пропустить одно уведомление, чем зациклиться и отправить сотню.
 */
async function claim(admin: Admin, id: string, field: Mark): Promise<boolean> {
  const { data, error } = await admin
    .from("bookings")
    .update({ [field]: new Date().toISOString() })
    .eq("id", id)
    .is(field, null)          // ещё не помечено — иначе кто-то нас опередил
    .select("id");

  if (error) {
    console.error(`reminders: не смогли пометить ${field} у ${id}:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function POST(req: Request) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const admin = createAdmin();
  const now = new Date();

  // Напоминание уходит за 4 часа, а отменить запись можно до 3 часов.
  // Разница в час — чтобы клиент успел среагировать: раньше напоминание
  // приходило ровно на границе отмены, и кнопка в нём уже не работала.
  const REMIND_H = 4;
  const CANCEL_H = 3;

  const remindAt = new Date(now.getTime() + REMIND_H * 3600_000);
  const in24h = new Date(now.getTime() + 24 * 3600_000);
  const ago24h = new Date(now.getTime() - 24 * 3600_000);

  let day = 0;
  let three = 0;
  let review = 0;

  // напоминание за сутки (с кнопкой «Приду»)
  const miniApp = process.env.MINIAPP_URL ?? "https://beauty-miniapp-tawny.vercel.app";
  const { data: dayRows } = await admin
    .from("bookings")
    .select(SELECT)
    .in("status", ["new", "confirmed", "paid"])
    .eq("is_synthetic", false)
    .is("reminded_day_at", null)
    .gt("starts_at", remindAt.toISOString())
    .lte("starts_at", in24h.toISOString())
    .limit(50);
  for (const b of (dayRows as unknown as Row[]) ?? []) {
    // Сначала занимаем запись, только потом шлём.
    // Если метка не сохранится, клиент не получит сообщение —
    // это лучше, чем получить его сто раз подряд.
    if (!(await claim(admin, b.id, "reminded_day_at"))) continue;

    await tgSend(
      b.client_id,
      `📅 Напоминание: завтра вы записаны\n\n` +
        `${b.service?.name ?? "Услуга"} · ${b.specialist?.full_name ?? ""}\n` +
        `🗓 ${fmtMsk(b.starts_at)}`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Приду", web_app: { url: `${miniApp}/?confirm=${b.id}` } }],
          ],
        },
      },
    );
    day++;
  }

  // напоминание за 4 часа — пока отмена ещё доступна
  const { data: threeRows } = await admin
    .from("bookings")
    .select(SELECT)
    .in("status", ["new", "confirmed", "paid"])
    .eq("is_synthetic", false)
    .is("reminded_3h_at", null)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", remindAt.toISOString())
    .limit(50);
  for (const b of (threeRows as unknown as Row[]) ?? []) {
    if (!(await claim(admin, b.id, "reminded_3h_at"))) continue;

    // до какого момента ещё можно отменить
    const cancelUntil = new Date(new Date(b.starts_at).getTime() - CANCEL_H * 3600_000);
    const canStillCancel = cancelUntil.getTime() > now.getTime();

    await tgSend(
      b.client_id,
      `⏰ Сегодня в ${fmtTimeMsk(b.starts_at)} вы записаны\n\n` +
        `${b.service?.name ?? "Услуга"} · ${b.specialist?.full_name ?? ""}\n` +
        (canStillCancel
          ? `\nНе сможете прийти? Отменить можно до ${fmtTimeMsk(cancelUntil.toISOString())}.`
          : `Ждём вас! 💅`),
      canStillCancel
        ? {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Отменить запись", web_app: { url: `${miniApp}/?cancel=${b.id}` } }],
              ],
            },
          }
        : undefined,
    );
    three++;
  }

  // запрос отзыва после визита (с кнопкой «Оставить отзыв»)
  const { data: reviewRows } = await admin
    .from("bookings")
    .select(SELECT)
    .in("status", ["paid", "completed"])
    .eq("is_synthetic", false)
    .is("review_requested_at", null)
    .lte("ends_at", now.toISOString())
    .gt("ends_at", ago24h.toISOString())
    .limit(50);
  for (const b of (reviewRows as unknown as Row[]) ?? []) {
    if (!(await claim(admin, b.id, "review_requested_at"))) continue;

    await tgSend(
      b.client_id,
      `Спасибо, что были у нас! 💖\n\n` +
        `Как прошёл визит — ${b.service?.name ?? "услуга"} у ${b.specialist?.full_name ?? "мастера"}? ` +
        `Будем благодарны за отзыв.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⭐ Оставить отзыв", web_app: { url: `${miniApp}/?review=${b.id}` } }],
          ],
        },
      },
    );
    review++;
  }

  return new Response(JSON.stringify({ ok: true, day, three, review }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}