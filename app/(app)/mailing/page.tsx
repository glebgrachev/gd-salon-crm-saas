// app/(app)/mailing/page.tsx
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MailingPage() {
  const supabase = await createClient();

  // 1. Проверяем, что пользователь авторизован
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 2. Проверяем, что пользователь — админ
  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/access-denied");

  // 3. Просто заголовок
  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">
        📨 Рассылки (новая страница)
      </h1>
      <p className="mt-2 text-neutral-500">
        Если вы это видите — страница работает!
      </p>
    </div>
  );
}