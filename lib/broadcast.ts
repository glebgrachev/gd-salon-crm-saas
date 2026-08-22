// lib/broadcast.ts

import { createAdmin } from "@/lib/supabase/admin";
import { tgSend } from "@/lib/notify";

export const SYNC_LIMIT = 50; // до 50 получателей отправляем синхронно
export const WORKER_BATCH = 200; // сколько pending разгребаем за один тик воркера

export function buildReplyMarkup(broadcastId: string, cta_url: string | null) {
  const miniApp = process.env.MINIAPP_URL ?? "https://beauty-miniapp-saas.vercel.app";
  const buttons: Array<Array<Record<string, unknown>>> = [];
  
  if (cta_url) {
    buttons.push([{ text: "Открыть", web_app: { url: cta_url } }]);
  } else {
    buttons.push([{ text: "Записаться", web_app: { url: miniApp } }]);
  }
  
  buttons.push([{ 
    text: "Отписаться от рассылок", 
    web_app: { url: `${miniApp}/?unsub=${broadcastId}` } 
  }]);
  
  return { inline_keyboard: buttons };
}

export async function sendBatch(
  admin: ReturnType<typeof createAdmin>,
  broadcastId: string,
  clientIds: number[], // client_id = telegram_id (из таблицы users)
  text: string,
  cta_url: string | null,
) {
  console.log(`📨 sendBatch начат для broadcast ${broadcastId}, ${clientIds.length} получателей`);

  // ===== 1. Получаем shop_id из broadcast =====
  const { data: broadcast, error: broadcastError } = await admin
    .from("broadcasts")
    .select("shop_id")
    .eq("id", broadcastId)
    .single();

  if (broadcastError || !broadcast?.shop_id) {
    console.error(`❌ shop_id не найден для broadcast ${broadcastId}:`, broadcastError);
    await markAllFailed(admin, broadcastId, clientIds, "shop_id_not_found");
    return;
  }

  // ===== 2. Получаем токен бота =====
  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select("bot_token")
    .eq("id", broadcast.shop_id)
    .maybeSingle();

  if (shopError || !shop?.bot_token) {
    console.error(`❌ Токен для салона ${broadcast.shop_id} не найден:`, shopError);
    await markAllFailed(admin, broadcastId, clientIds, "bot_token_not_found");
    return;
  }

  console.log(`✅ Токен бота получен для салона ${broadcast.shop_id}`);

  // ===== 3. Проверяем пользователей (client_id = telegram_id) =====
  const { data: users, error: usersError } = await admin
    .from("users")
    .select("telegram_id, promo_opt_out, first_name, username")
    .in("telegram_id", clientIds) // client_id = telegram_id
    .eq("promo_opt_out", false); // Только не отписавшиеся

  if (usersError) {
    console.error(`❌ Ошибка получения пользователей:`, usersError);
    await markAllFailed(admin, broadcastId, clientIds, "users_error");
    return;
  }

  if (!users || users.length === 0) {
    console.log(`⚠️ Нет активных пользователей для отправки`);
    await markAllFailed(admin, broadcastId, clientIds, "no_active_users");
    return;
  }

  console.log(`📨 Найдено ${users.length} активных пользователей из ${clientIds.length}`);

  // ===== 4. Отправляем сообщения =====
  const botToken = shop.bot_token;
  const reply_markup = buildReplyMarkup(broadcastId, cta_url);
  
  let sent = 0;
  let failed = 0;
  let optedOut = 0;

  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const chatId = user.telegram_id; // client_id = telegram_id
    
    console.log(`📤 [${i + 1}/${users.length}] Отправка пользователю ${chatId} (${user.first_name || user.username || 'без имени'})`);

    try {
      // Отправляем в Telegram
      const ok = await tgSend(
        Number(chatId),
        text,
        botToken,
        { reply_markup }
      );

      if (ok) {
        sent++;
        await admin
          .from("broadcast_recipients")
          .update({ 
            status: "sent", 
            sent_at: new Date().toISOString(),
            error: null
          })
          .eq("broadcast_id", broadcastId)
          .eq("client_id", chatId); // client_id = telegram_id
        
        console.log(`✅ [${i + 1}/${users.length}] Отправлено пользователю ${chatId}`);
      } else {
        failed++;
        await admin
          .from("broadcast_recipients")
          .update({ 
            status: "failed", 
            error: "tg_send_failed",
            sent_at: null
          })
          .eq("broadcast_id", broadcastId)
          .eq("client_id", chatId);
        
        console.log(`❌ [${i + 1}/${users.length}] Не удалось отправить пользователю ${chatId}`);
      }
    } catch (err: any) {
      failed++;
      console.error(`❌ [${i + 1}/${users.length}] Ошибка при отправке ${chatId}:`, err.message);
      
      await admin
        .from("broadcast_recipients")
        .update({ 
          status: "failed", 
          error: err.message || "unknown_error",
          sent_at: null
        })
        .eq("broadcast_id", broadcastId)
        .eq("client_id", chatId);
    }

    // Задержка для Telegram (30 сообщений в секунду максимум)
    if ((i + 1) % 30 === 0 && i + 1 < users.length) {
      console.log(`⏳ Пауза 1 секунда после ${i + 1} сообщений`);
      await sleep(1000);
    }
  }

  console.log(`📊 Итог рассылки ${broadcastId}:`);
  console.log(`  ✅ Отправлено: ${sent}`);
  console.log(`  ❌ Ошибок: ${failed}`);
  console.log(`  📝 Отписок: ${optedOut}`);

  // ===== 5. Обновляем статус broadcast =====
  await admin
    .from("broadcasts")
    .update({
      sent,
      failed,
      opted_out: optedOut,
      status: "done",
      finished_at: new Date().toISOString()
    })
    .eq("id", broadcastId);

  console.log(`✅ Рассылка ${broadcastId} завершена`);
}

// ===== Вспомогательные функции =====

async function markAllFailed(
  admin: ReturnType<typeof createAdmin>,
  broadcastId: string,
  clientIds: number[],
  error: string
) {
  console.log(`⚠️ Помечаем ${clientIds.length} получателей как failed: ${error}`);
  
  for (const clientId of clientIds) {
    await admin
      .from("broadcast_recipients")
      .update({ 
        status: "failed", 
        error,
        sent_at: null
      })
      .eq("broadcast_id", broadcastId)
      .eq("client_id", clientId);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}