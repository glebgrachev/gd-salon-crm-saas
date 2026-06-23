import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Гейт по allowlist: аутентификация прошла, но если email не в admins —
      // разлогиниваем и показываем "доступ запрещён".
      const { data: isAdmin } = await supabase.rpc("is_admin");
      if (!isAdmin) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/access-denied`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/access-denied`);
}
