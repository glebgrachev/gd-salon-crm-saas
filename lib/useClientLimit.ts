// lib/useClientLimit.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useClientLimit(shopId: number) {
  const [limit, setLimit] = useState<number>(-1);
  const [current, setCurrent] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLimit() {
      const supabase = createClient();
      
      // Получаем лимит из модулей магазина
      const { data: shop } = await supabase
        .from("shops")
        .select("modules")
        .eq("id", shopId)
        .single();
      
      const clientLimit = shop?.modules?.clients ?? -1;
      setLimit(clientLimit);

      // Считаем текущих клиентов
      const { count } = await supabase
        .from("clients")
        .select("*", { count: 'exact', head: true })
        .eq("shop_id", shopId);
      
      setCurrent(count ?? 0);
      setLoading(false);
    }

    loadLimit();
  }, [shopId]);

  const isLimitReached = limit !== -1 && current >= limit;
  const isNearLimit = limit !== -1 && current >= limit * 0.7 && !isLimitReached;

  return { limit, current, loading, isLimitReached, isNearLimit };
}