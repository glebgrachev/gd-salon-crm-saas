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

  if (!chatId) {
    console.error('❌ tgSend: chatId не передан');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: Number(chatId), // ✅ Приводим к числу
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...extra,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // 🔍 Детальная обработка ошибок Telegram
      const errorCode = data.error_code;
      const description = data.description || 'Unknown error';
      
      console.error(`❌ tgSend: Telegram API error (${res.status}):`, {
        error_code: errorCode,
        description: description,
        chat_id: chatId,
        bot_token: botToken.slice(0, 10) + '...' // скрываем токен в логах
      });

      // Специфичные ошибки
      if (errorCode === 400) {
        if (description.includes('chat not found')) {
          console.error(`❌ Пользователь ${chatId} не найден (возможно, не начинал диалог с ботом)`);
        } else if (description.includes('bot was blocked')) {
          console.error(`❌ Пользователь ${chatId} заблокировал бота`);
        } else if (description.includes('chat_id is empty')) {
          console.error(`❌ chat_id пустой`);
        } else if (description.includes('text is empty')) {
          console.error(`❌ Текст сообщения пустой`);
        }
      } else if (errorCode === 403) {
        console.error(`❌ Бот заблокирован пользователем ${chatId}`);
      } else if (errorCode === 429) {
        console.error(`❌ Слишком много запросов! Нужна пауза.`);
      } else if (errorCode === 401) {
        console.error(`❌ Неверный токен бота`);
      }

      return false;
    }

    console.log(`✅ tgSend: сообщение отправлено в Telegram (chat_id: ${chatId})`);
    return true;
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