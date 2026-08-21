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
  refreshCurrency: () => Promise<void>; // 👈 Добавляем
};

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // 👈 Выносим загрузку в отдельную функцию
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

      if (shop?.currency_id) {
        const { data: currencyData } = await supabase
          .from('currencies')
          .select('*')
          .eq('id', shop.currency_id)
          .single();
        
        setCurrency(currencyData);
      } else {
        // Дефолтная валюта (RUB)
        const { data: defaultCurrency } = await supabase
          .from('currencies')
          .select('*')
          .eq('code', 'RUB')
          .single();
        setCurrency(defaultCurrency);
      }
    } catch (error) {
      console.error('Error loading currency:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurrency();

    // 👈 Слушаем событие обновления валюты из настроек
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

  // 👈 Метод для принудительного обновления валюты
  const refreshCurrency = async () => {
    await loadCurrency();
  };

  return (
    <ShopContext.Provider value={{ currency, loading, formatPrice, refreshCurrency }}>
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