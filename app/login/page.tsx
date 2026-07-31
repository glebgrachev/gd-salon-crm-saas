"use client";

import { createClient } from "@/lib/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// 📋 Словарь ошибок (английский → русский)
const errorMessages: Record<string, string> = {
  "Invalid login credentials": "Неверный email или пароль",
  "Email not confirmed": "Email не подтверждён. Проверьте почту",
  "User not found": "Пользователь с таким email не найден",
  "Invalid email": "Неверный формат email",
  "Password too short": "Пароль должен содержать минимум 6 символов",
  "User already registered": "Пользователь с таким email уже зарегистрирован",
  "Email address is not authorized": "Этот email не входит в список администраторов",
  "Invalid password": "Неверный пароль",
  "Email rate limit exceeded": "Слишком много попыток. Попробуйте позже",
};

// Функция для перевода ошибки
function translateError(message: string): string {
  return errorMessages[message] || message;
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");

  // 🔥 Вход через Google — используем переменную окружения
  async function signInWithGoogle() {
    setLoading(true);
    setError(null);

    const redirectTo = process.env.NEXT_PUBLIC_APP_URL 
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
      : `${location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setError(translateError(error.message));
      setLoading(false);
    }
  }

  // Вход через Email + Пароль
  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(translateError(error.message));
      setLoading(false);
      return;
    }

    setLoading(false);
    router.push("/");
  }

  // Регистрация через Email + Пароль
  async function signUpWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 6) {
      setError("Пароль должен содержать минимум 6 символов");
      setLoading(false);
      return;
    }

    const redirectTo = process.env.NEXT_PUBLIC_APP_URL 
      ? process.env.NEXT_PUBLIC_APP_URL
      : `${location.origin}/`;

    // 1. Регистрируем пользователя
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (signUpError) {
      setError(translateError(signUpError.message));
      setLoading(false);
      return;
    }

    // 2. 🔥 Сразу логиним пользователя (если подтверждение отключено)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      // Если не получилось залогиниться — просим войти вручную
      alert("Регистрация прошла. Теперь войдите вручную.");
      setLoading(false);
      router.push("/login");
      return;
    }

    setLoading(false);
    router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
            BeautyApp
          </h1>
          <p className="mt-1 text-sm text-neutral-500">
            {mode === "login"
              ? "Вход для администраторов"
              : "Регистрация нового администратора"}
          </p>
        </div>

        {/* Переключатель между входом и регистрацией */}
        <div className="mb-6 flex rounded-lg bg-neutral-100 p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "login"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Вход
          </button>
          <button
            onClick={() => setMode("register")}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === "register"
                ? "bg-white text-neutral-900 shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            Регистрация
          </button>
        </div>

        {/* Форма Email + Пароль */}
        <form
          onSubmit={mode === "login" ? signInWithEmail : signUpWithEmail}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="admin@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700">
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
              placeholder="••••••••"
              required
            />
            {mode === "register" && (
              <p className="mt-1 text-xs text-neutral-400">
                Минимум 6 символов
              </p>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {loading
              ? "Загрузка..."
              : mode === "login"
              ? "Войти"
              : "Зарегистрироваться"}
          </button>
        </form>

        {/* Разделитель */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-white px-2 text-neutral-400">или</span>
          </div>
        </div>

        {/* Кнопка Google (для суперадминов) */}
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:bg-neutral-50 disabled:opacity-60"
        >
          <GoogleIcon />
          {loading ? "Перенаправляем…" : "Войти через Google"}
        </button>

        <p className="mt-6 text-center text-xs text-neutral-400">
          {mode === "login"
            ? "Доступ только для администраторов из списка."
            : "После регистрации дождитесь подтверждения email."}
        </p>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}