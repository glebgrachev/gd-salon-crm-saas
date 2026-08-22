// lib/notify-admins.ts
import { createClient } from "./supabase/server";
import { tgSend } from "./notify";

type NotificationEvent = 
  | 'new_booking'
  | 'new_order'
  | 'booking_cancelled'
  | 'reservation_cancelled'
  | 'booking_rescheduled';

type NotificationData = {
  shop_id: number;
  event_type: NotificationEvent;
  message: string;
  data?: Record<string, any>;
};

/**
 * Отправить уведомление админам салона
 */
export async function notifyAdmins(event: NotificationData, botToken: string) {
  try {
    const supabase = await createClient();

    console.log(`📨 [notifyAdmins] Событие: ${event.event_type}, shop_id: ${event.shop_id}`);

    // 1. Получаем получателей из admins.telegram_id
    const { data: admins, error: adminsError } = await supabase
      .from('admins')
      .select('telegram_id')
      .eq('shop_id', event.shop_id);

    if (adminsError) {
      console.error('❌ [notifyAdmins] Ошибка получения admins:', adminsError);
      return;
    }

    let recipients: number[] = [];

    // 2. Собираем все telegram_id из admins
    admins?.forEach(admin => {
      if (admin.telegram_id && Array.isArray(admin.telegram_id)) {
        admin.telegram_id.forEach((id: number) => {
          if (id > 0 && !recipients.includes(id)) {
            recipients.push(id);
          }
        });
      }
    });

    console.log(`📨 [notifyAdmins] Найдено получателей: ${recipients.length}`);

    if (recipients.length === 0) {
      console.log('ℹ️ [notifyAdmins] Нет получателей для уведомлений');
      return;
    }

    if (!botToken) {
      console.error('❌ [notifyAdmins] Токен не передан');
      return;
    }

    const formattedMessage = formatNotificationMessage(event);

    console.log('🔥🔥🔥 ОТПРАВКА АДМИНАМ!');
    console.log('🔥🔥🔥 recipients:', JSON.stringify(recipients));
    console.log('🔥🔥🔥 botToken:', botToken ? 'ЕСТЬ (длина ' + botToken.length + ')' : 'НЕТ');
    console.log('🔥🔥🔥 message:', formattedMessage);

    let successCount = 0;
    for (const chatId of recipients) {
      console.log(`🔥🔥🔥 Отправка для ${chatId}...`);
      const ok = await tgSend(chatId, formattedMessage, botToken);
      console.log(`🔥🔥🔥 Результат для ${chatId}:`, ok ? '✅ УСПЕШНО' : '❌ ОШИБКА');
      if (ok) {
        successCount++;
      }
    }

    console.log(`📨 [notifyAdmins] Отправлено ${successCount}/${recipients.length} уведомлений`);

  } catch (error) {
    console.error('❌ [notifyAdmins] Ошибка:', error);
  }
}

function formatNotificationMessage(event: NotificationData): string {
  const { event_type, message } = event;
  
  let header = '🔔';
  switch (event_type) {
    case 'new_booking':
      header = '📅 <b>Новая запись!</b>';
      break;
    case 'new_order':
      header = '🛍️ <b>Новый заказ!</b>';
      break;
    case 'booking_cancelled':
      header = '❌ <b>Отмена записи</b>';
      break;
    case 'reservation_cancelled':
      header = '❌ <b>Отмена резерва товара</b>';
      break;
    case 'booking_rescheduled':
      header = '🔄 <b>Перенос записи</b>';
      break;
  }

  return `${header}\n\n${message}`;
}

export async function notifyNewBooking(
  shop_id: number,
  data: {
    service_name: string;
    specialist_name: string;
    starts_at: string;
    client_name: string;
    price: number;
    currency_symbol?: string;
  },
  botToken: string
) {
  console.log('🔥🔥🔥 notifyNewBooking ВЫЗВАНА!');
  console.log('🔥🔥🔥 shop_id:', shop_id);

  const date = new Date(data.starts_at);
  const dateStr = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const message = `
👤 <b>Клиент:</b> ${data.client_name}
💇 <b>Услуга:</b> ${data.service_name}
👨‍💼 <b>Мастер:</b> ${data.specialist_name}
📅 <b>Дата и время:</b> ${dateStr}
💰 <b>Сумма:</b> ${data.currency_symbol || '₽'} ${data.price}
  `.trim();

  await notifyAdmins({
    shop_id,
    event_type: 'new_booking',
    message,
  }, botToken);
}

export async function notifyNewOrder(
  shop_id: number,
  data: {
    items: string[];
    products?: string[];
    client_name: string;
    total: number;
    currency_symbol?: string;
  },
  botToken: string
) {
  console.log('🔥🔥🔥 notifyNewOrder ВЫЗВАНА!');

  const itemsList = data.items.map((item, i) => `  ${i + 1}. ${item}`).join('\n');
  const productsList = data.products?.length 
    ? `\n🛍️ <b>Товары:</b>\n${data.products.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`
    : '';

  const message = `
👤 <b>Клиент:</b> ${data.client_name}
📋 <b>Услуги:</b>
${itemsList}${productsList}
💰 <b>Итого:</b> ${data.currency_symbol || '₽'} ${data.total}
  `.trim();

  await notifyAdmins({
    shop_id,
    event_type: 'new_order',
    message,
  }, botToken);
}

export async function notifyBookingCancelled(
  shop_id: number,
  data: {
    service_name: string;
    specialist_name: string;
    starts_at: string;
    client_name: string;
  },
  botToken: string
) {
  console.log('🔥🔥🔥 notifyBookingCancelled ВЫЗВАНА!');

  const date = new Date(data.starts_at);
  const dateStr = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const message = `
👤 <b>Клиент:</b> ${data.client_name}
💇 <b>Услуга:</b> ${data.service_name}
👨‍💼 <b>Мастер:</b> ${data.specialist_name}
📅 <b>Было запланировано:</b> ${dateStr}
  `.trim();

  await notifyAdmins({
    shop_id,
    event_type: 'booking_cancelled',
    message,
  }, botToken);
}

export async function notifyReservationCancelled(
  shop_id: number,
  data: {
    product_name: string;
    quantity: number;
    client_name: string;
  },
  botToken: string
) {
  console.log('🔥🔥🔥 notifyReservationCancelled ВЫЗВАНА!');

  const message = `
👤 <b>Клиент:</b> ${data.client_name}
📦 <b>Товар:</b> ${data.product_name}
🔢 <b>Количество:</b> ${data.quantity} шт
  `.trim();

  await notifyAdmins({
    shop_id,
    event_type: 'reservation_cancelled',
    message,
  }, botToken);
}

export async function notifyBookingRescheduled(
  shop_id: number,
  data: {
    service_name: string;
    specialist_name: string;
    old_starts_at: string;
    new_starts_at: string;
    client_name: string;
  },
  botToken: string
) {
  console.log('🔥🔥🔥 notifyBookingRescheduled ВЫЗВАНА!');

  const oldDate = new Date(data.old_starts_at);
  const newDate = new Date(data.new_starts_at);
  
  const oldDateStr = oldDate.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  
  const newDateStr = newDate.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const message = `
👤 <b>Клиент:</b> ${data.client_name}
💇 <b>Услуга:</b> ${data.service_name}
👨‍💼 <b>Мастер:</b> ${data.specialist_name}
📅 <b>Было:</b> ${oldDateStr}
📅 <b>Стало:</b> ${newDateStr}
  `.trim();

  await notifyAdmins({
    shop_id,
    event_type: 'booking_rescheduled',
    message,
  }, botToken);
}