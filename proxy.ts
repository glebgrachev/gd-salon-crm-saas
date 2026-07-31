import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const publicRoutes = [
  "/login",
  "/register",
  "/access-denied",
  "/auth/callback",
  "/onboarding",
  "/blocked",
  "/tariffs", // 👈 Добавляем, чтобы страница тарифов была доступна без проверки модулей
];

export async function proxy(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 1. Если пользователь НЕ авторизован
  if (!user) {
    if (
      publicRoutes.includes(pathname) ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api")
    ) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2. Проверяем роли
  const { data: isAdmin } = await supabase.rpc("is_admin");
  const { data: isSuperAdmin } = await supabase.rpc("is_superadmin");

  // 3. Если не админ и не суперадмин
  if (!isAdmin && !isSuperAdmin) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/access-denied", request.url));
  }

  // 4. Суперадмин → пропускаем всё
  if (isSuperAdmin) {
    return NextResponse.next();
  }

  // 5. Админ (владелец салона)
  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user.id)
    .maybeSingle();

  // Если нет shop_id → на онбординг
  if (!admin?.shop_id && pathname !== "/onboarding") {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // 6. Проверка блокировки салона
  if (admin?.shop_id) {
    const { data: shop } = await supabase
      .from("shops")
      .select("blocked, modules")
      .eq("id", admin.shop_id)
      .single();

    // Если салон заблокирован → разлогиниваем и отправляем на /blocked
    if (shop?.blocked) {
      if (pathname === "/blocked") {
        return NextResponse.next();
      }
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/blocked", request.url));
    }

    // 🔥 7. ПРОВЕРКА МОДУЛЕЙ
    const moduleMap: Record<string, string> = {
      "/analytics": "analytics",
      "/loyalty": "loyalty",
      "/broadcasts": "broadcasts",
      "/promotions": "promotions",
      "/certificates": "certificates",
      "/stock": "stock",
      "/retention": "retention",
      "/waitlist": "waitlist",
    };

    const moduleKey = moduleMap[pathname];
    if (moduleKey && !shop?.modules?.[moduleKey]) {
      // Если модуль выключен — редирект на тарифы
      return NextResponse.redirect(new URL("/tariffs", request.url));
    }
  }

  // Если есть shop_id и это онбординг → в админку
  if (admin?.shop_id && pathname === "/onboarding") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};