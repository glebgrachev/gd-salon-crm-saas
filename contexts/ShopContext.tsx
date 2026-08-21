// contexts/ShopContext.tsx

'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Currency = {
  id: number;
  code: string;
  symbol: string;
  name: string;
};

type ShopContextType = {
  currency: Currency | null;
  loading: boolean;
  formatPrice: (amount: number) => string;
  refreshCurrency: () => Promise<void>;
  version: number; // 👈 Добавляем версию
};

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0); // 👈 Добавляем версию
  const supabase = createClient();

  const loadCurrency = async () => {
    try {
      setLoading(true);
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

      let newCurrency = null;
      if (shop?.currency_id) {
        const { data: currencyData } = await supabase
          .from('currencies')
          .select('*')
          .eq('id', shop.currency_id)
          .single();
        newCurrency = currencyData;
      } else {
        const { data: defaultCurrency } = await supabase
          .from('currencies')
          .select('*')
          .eq('code', 'RUB')
          .single();
        newCurrency = defaultCurrency;
      }

      setCurrency(newCurrency);
      setVersion(prev => prev + 1); // 👈 Увеличиваем версию при обновлении
    } catch (error) {
      console.error('Error loading currency:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrency();

    const handleCurrencyChange = () => {
      loadCurrency();
    };
    window.addEventListener('currency-changed', handleCurrencyChange);

    return () => {
      window.removeEventListener('currency-changed', handleCurrencyChange);
    };
  }, [supabase]);

  const formatPrice = (amount: number) => {
    if (!currency) return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
    return `${Math.round(amount).toLocaleString('ru-RU')} ${currency.symbol}`;
  };

  const refreshCurrency = async () => {
    await loadCurrency();
  };

  return (
    <ShopContext.Provider value={{ currency, loading, formatPrice, refreshCurrency, version }}>
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const context = useContext(ShopContext);
  if (context === undefined) {
    throw new Error('useShop must be used within a ShopProvider');
  }
  return context;
}