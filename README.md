# BeautyApp — CRM салона

Веб-админка салона на базе CRM G&D Digital Lab.
Стек: Next.js (App Router) + Tailwind + shadcn/ui + Supabase (SSR-auth).

## Запуск
1. cp .env.local.example .env.local и заполни NEXT_PUBLIC_SUPABASE_ANON_KEY
2. pnpm install
3. pnpm dev → http://localhost:3000

Доступ к данным — под авторизованным админом через RLS (is_admin).
