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
  shopId: number | null;
  currency: Currency | null;
  loading: boolean;
  formatPrice: (amount: number) => string;
  refreshCurrency: () => Promise<void>;
  version: number;
};

const ShopContext = createContext<ShopContextType | undefined>(undefined);

export function ShopProvider({ children }: { children: React.ReactNode }) {
  const [shopId, setShopId] = useState<number | null>(null);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const supabase = createClient();

  const loadCurrency = async () => {
    try {
      setLoading(true);
      console.log('🔍 ShopContext: загрузка...');
      
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔍 ShopContext: user =', user?.id);
      
      if (!user) {
        console.log('❌ ShopContext: пользователь не найден');
        setLoading(false);
        return;
      }

      const { data: admin, error } = await supabase
        .from('admins')
        .select('shop_id')
        .eq('user_uid', user.id)
        .single();
      
      console.log('🔍 ShopContext: admin =', admin, 'error =', error);

      if (!admin?.shop_id) {
        console.log('❌ ShopContext: admin не найден или нет shop_id');
        setLoading(false);
        return;
      }

      const currentShopId = admin.shop_id;
      setShopId(currentShopId);
      console.log('✅ ShopContext: shopId =', currentShopId);

      const { data: shop } = await supabase
        .from('shops')
        .select('currency_id')
        .eq('id', currentShopId)
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
      setVersion(prev => prev + 1);
      
      console.log('✅ ShopContext: currency =', newCurrency?.code);
    } catch (error) {
      console.error('❌ ShopContext: ошибка', error);
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
  }, []);

  const formatPrice = (amount: number) => {
    if (!currency) return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
    return `${Math.round(amount).toLocaleString('ru-RU')} ${currency.symbol}`;
  };

  const refreshCurrency = async () => {
    await loadCurrency();
  };

  return (
    <ShopContext.Provider value={{ 
      shopId,
      currency, 
      loading, 
      formatPrice, 
      refreshCurrency, 
      version 
    }}>
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