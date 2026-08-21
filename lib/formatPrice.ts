// lib/formatPrice.ts
export function formatPrice(amount: number, symbol: string = '₽') {
  if (amount === null || amount === undefined) return '—';
  return `${symbol} ${Math.round(amount).toLocaleString('ru-RU')}`;
}

export function formatPriceRaw(amount: number) {
  if (amount === null || amount === undefined) return '—';
  return Math.round(amount).toLocaleString('ru-RU');
}