import crypto from "crypto";

export type TgUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

/**
 * Проверяет подпись Telegram WebApp initData.
 * Возвращает данные пользователя при валидной подписи, иначе null.
 */
export function validateInitData(initData: string, botToken: string): TgUser | null {
  if (!initData || !botToken) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (computed !== hash) return null;

  // свежесть (необязательно, но полезно): не старше 24ч
  const authDate = Number(params.get("auth_date") ?? 0);
  if (authDate && Date.now() / 1000 - authDate > 86400) return null;

  const userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw) as TgUser;
  } catch {
    return null;
  }
}

export type TgContact = {
  user_id: number;
  phone_number: string;
  first_name?: string;
  last_name?: string;
};

/**
 * Проверяет подпись ответа Telegram WebApp.requestContact().
 * Строка вида: contact=<json>&auth_date=<ts>&hash=<hex>
 * Возвращает контакт при валидной подписи, иначе null.
 *
 * Важно: без этой проверки любой мог бы прислать чужой номер
 * и привязаться к кабинету чужого мастера.
 */
export function validateContact(response: string, botToken: string): TgContact | null {
  if (!response || !botToken) return null;

  const params = new URLSearchParams(response);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (computed !== hash) return null;

  const authDate = Number(params.get("auth_date") ?? 0);
  if (authDate && Date.now() / 1000 - authDate > 3600) return null; // контакт живёт 1 час

  const raw = params.get("contact");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TgContact;
  } catch {
    return null;
  }
}
