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
  "Email address is not authorized": "Доступ запрещён",
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

  // 🔥 Скрытый вход через Google (только для суперадминов)
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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
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
        {/* 👇 Заголовок */}
        <div className="relative mb-8 flex items-center justify-center">
          {/* 👇 Абсолютно невидимая кнопка Google — только на вкладке "Вход" */}
          {mode === "login" && (
            <div
              onClick={signInWithGoogle}
              className="absolute left-0 h-12 w-12"
            />
          )}

          <div className="text-center">
            <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
              BeautyApp
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {mode === "login"
                ? "Вход в систему"
                : "Регистрация"}
            </p>
          </div>
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

        <p className="mt-6 text-center text-xs text-neutral-400">
          {mode === "login"
            ? "Введите email и пароль для входа"
            : "Зарегистрируйтесь, чтобы начать работу"}
        </p>
      </div>
    </main>
  );
}