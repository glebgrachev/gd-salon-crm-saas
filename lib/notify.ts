// lib/notify.ts

// Отправка сообщений через Telegram Bot API + форматирование времени (МСК).
// ВНИМАНИЕ: botToken теперь передаётся извне (из таблицы shops.bot_token)

export async function tgSend(
  chatId: number | string,
  text: string,
  botToken: string,
  extra?: Record<string, unknown>,
): Promise<boolean> {
  if (!botToken) {
    console.error('❌ tgSend: botToken не передан');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...extra,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ tgSend: Telegram API error (${res.status}):`, errorText);
    }

    return res.ok;
  } catch (error) {
    console.error('❌ tgSend: fetch error:', error);
    return false;
  }
}

// Форматирование даты/времени по МСК
// ВНИМАНИЕ: время в БД уже хранится в МСК, поэтому НЕ используем timeZone
export function fmtMsk(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtTimeMsk(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Хелпер для форматирования цены (используется в уведомлениях)
export function fmtPrice(price: number): string {
  return price.toLocaleString("ru-RU") + " ₽";
}