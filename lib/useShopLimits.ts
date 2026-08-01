// lib/useShopLimits.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Limits = {
  clients: number;
  specialists: number;
  bookings: number;
};

export function useShopLimits() {
  const [limits, setLimits] = useState<Limits>({
    clients: -1,
    specialists: -1,
    bookings: -1,
  });
  const [loading, setLoading] = useState(true);
  const [shopId, setShopId] = useState<number | null>(null);

  useEffect(() => {
    async function loadLimits() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("shop_id")
        .eq("user_uid", user.id)
        .single();

      if (!admin?.shop_id) {
        setLoading(false);
        return;
      }

      setShopId(admin.shop_id);

      const { data: shop } = await supabase
        .from("shops")
        .select("modules")
        .eq("id", admin.shop_id)
        .single();

      const modules = shop?.modules || {};
      setLimits({
        clients: modules.clients ?? -1,
        specialists: modules.specialists ?? -1,
        bookings: modules.bookings ?? -1,
      });
      setLoading(false);
    }

    loadLimits();
  }, []);

  return { limits, loading, shopId };
}