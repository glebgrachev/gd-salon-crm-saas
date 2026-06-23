import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Использовать в Server Components, Route Handlers и серверных экшенах.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // В Server Components запись кук бросает исключение — это ок,
          // сессию обновляет middleware. Глушим, чтобы не падать.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* noop */
          }
        },
      },
    },
  );
}
