export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight text-neutral-900">
          Доступ запрещён
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Этот аккаунт не входит в список администраторов CRM. Войдите под
          рабочим аккаунтом или обратитесь к владельцу проекта.
        </p>
        <a
          href="/login"
          className="mt-6 inline-block rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          Вернуться ко входу
        </a>
      </div>
    </main>
  );
}
