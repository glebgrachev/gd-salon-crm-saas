import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Currency = {
  id: number;
  code: string;
  symbol: string;
  name: string;
};

export function useShopCurrency() {
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function loadShopCurrency() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: admin } = await supabase
          .from('admins')
          .select('shop_id')
          .eq('user_uid', user.id)
          .single();

        if (!admin?.shop_id) {
          setLoading(false);
          return;
        }

        const { data: shop } = await supabase
          .from('shops')
          .select('currency_id')
          .eq('id', admin.shop_id)
          .single();

        if (!shop?.currency_id) {
          const { data: defaultCurrency } = await supabase
            .from('currencies')
            .select('*')
            .eq('code', 'RUB')
            .single();
          
          if (defaultCurrency) {
            setCurrency(defaultCurrency);
          }
          setLoading(false);
          return;
        }

        const { data: currencyData } = await supabase
          .from('currencies')
          .select('*')
          .eq('id', shop.currency_id)
          .single();

        setCurrency(currencyData);
      } catch (error) {
        console.error('Error loading shop currency:', error);
      } finally {
        setLoading(false);
      }
    }

    loadShopCurrency();
  }, [supabase]);

  const formatPrice = (amount: number) => {
    if (!currency) return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
    // 👈 Сначала сумма, потом символ
    return `${Math.round(amount).toLocaleString('ru-RU')} ${currency.symbol}`;
  };

  return { currency, loading, formatPrice };
}