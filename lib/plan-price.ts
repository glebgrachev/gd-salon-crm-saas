// lib/plan-price.ts

export type PlanPrice = {
  price: number;
  symbol: string;
  code: string;
};

/**
 * Получить цену тарифа в зависимости от валюты салона
 */
export function getPlanPriceByCurrency(
  plan: { price_monthly: number; price_byn: number },
  currencyCode: string = 'RUB'
): PlanPrice {
  if (currencyCode === 'BYN') {
    return {
      price: plan.price_byn,
      symbol: 'Br',
      code: 'BYN'
    };
  }
  // По умолчанию RUB
  return {
    price: plan.price_monthly,
    symbol: '₽',
    code: 'RUB'
  };
}

/**
 * Отформатировать цену тарифа для отображения
 */
export function formatPlanPrice(
  plan: { price_monthly: number; price_byn: number },
  currencyCode: string = 'RUB'
): string {
  const { price, symbol } = getPlanPriceByCurrency(plan, currencyCode);
  if (price === 0) return 'Бесплатно';
  return `${symbol} ${price}`;
}

/**
 * Получить цену и символ валюты для тарифа
 */
export function getPlanPriceWithSymbol(
  plan: { price_monthly: number; price_byn: number },
  currencyCode: string = 'RUB'
): { price: number; symbol: string } {
  return getPlanPriceByCurrency(plan, currencyCode);
}