"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Обновляет страницу, когда меняются данные в указанных таблицах.
 *
 * Supabase шлёт событие, мы дёргаем router.refresh() — Next перезапрашивает
 * серверные компоненты и подменяет разметку без полной перезагрузки.
 *
 * Изменения приходят пачками (например, приход по накладной на 5 позиций),
 * поэтому обновление откладывается на 400 мс и схлопывается в одно.
 *
 * @param tables   таблицы, за которыми следим
 * @param onChange необязательный колбэк — если разделу нужно перезагрузить
 *                 собственные данные, а не только серверные компоненты
 */
export function useRealtime(tables: string[], onChange?: () => void) {
  const router = useRouter();

  // держим колбэк в ref, чтобы не пересоздавать подписку на каждый рендер
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  const key = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ping = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        router.refresh();
        cbRef.current?.();
      }, 400);
    };

    const channel = supabase.channel(`crm:${key}`);

    for (const table of key.split(",")) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        ping,
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [key, router]);
}
