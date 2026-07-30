"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export default function BlockedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center mb-4">
          <ShieldAlert className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
          Салон заблокирован
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Ваш салон временно заблокирован администрацией платформы.
          <br />
          <span className="mt-1 block text-xs text-neutral-400">
            Для уточнения информации обратитесь в поддержку.
          </span>
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Вернуться ко входу
        </Link>
      </div>
    </main>
  );
}