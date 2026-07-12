"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Smartphone, KeyRound, Check, Unlink, Copy } from "lucide-react";
import PhoneInput from "@/components/phone-input";
import { saveSpecialistPhone, generateLinkCode, unlinkSpecialist } from "./actions";

export type AccessInfo = {
  telegram_id: number | null;
  phone: string | null;
  link_code: string | null;
  link_code_expires_at: string | null;
};

export default function SpecialistAccess({
  specialistId,
  access,
  botName,
}: {
  specialistId: string;
  access: AccessInfo;
  botName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState<string | null>(access.phone ?? null);
  const [phoneValid, setPhoneValid] = useState(true);
  const [code, setCode] = useState<string | null>(
    access.link_code && access.link_code_expires_at && new Date(access.link_code_expires_at) > new Date()
      ? access.link_code
      : null,
  );

  const linked = access.telegram_id != null;

  function savePhone() {
    if (!phoneValid) {
      toast.error("Проверьте номер телефона");
      return;
    }
    startTransition(async () => {
      const r = await saveSpecialistPhone(specialistId, phone ?? "");
      if (r.ok) {
        toast.success("Телефон сохранён");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function makeCode() {
    startTransition(async () => {
      const r = await generateLinkCode(specialistId);
      if (r.ok) {
        setCode(r.code);
        toast.success("Код создан, действует 24 часа");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function unlink() {
    if (!confirm("Отвязать мастера от Telegram? Он потеряет доступ в приложение.")) return;
    startTransition(async () => {
      const r = await unlinkSpecialist(specialistId);
      if (r.ok) {
        toast.success("Доступ отозван");
        setCode(null);
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code);
    toast.success("Код скопирован");
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-neutral-900">Доступ в приложение</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Мастер сможет открыть {botName} и увидеть свои записи, график, начисления и документы.
      </p>

      {linked ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <Check className="h-4 w-4 text-emerald-600" />
          <div className="flex-1 text-sm text-emerald-800">
            Доступ подключён
            <span className="ml-2 text-xs text-emerald-600">Telegram ID: {access.telegram_id}</span>
          </div>
          <button
            onClick={unlink}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-white hover:text-red-600 disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" />
            Отвязать
          </button>
        </div>
      ) : (
        <>
          {/* способ 1: телефон */}
          <div className="mt-4 rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-700">
              <Smartphone className="h-4 w-4" />
              Способ 1 — по телефону
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Мастер открывает приложение и делится контактом. Если номер совпадёт — доступ откроется сам.
            </p>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-500">Телефон мастера</label>
                <PhoneInput
                  value={phone}
                  onChange={(e164, valid) => {
                    setPhone(e164);
                    setPhoneValid(valid);
                  }}
                  disabled={pending}
                />
              </div>
              <button
                onClick={savePhone}
                disabled={pending || !phoneValid}
                className="mt-5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-50"
              >
                Сохранить
              </button>
            </div>
          </div>

          {/* способ 2: код */}
          <div className="mt-3 rounded-lg border border-neutral-200 p-4">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-700">
              <KeyRound className="h-4 w-4" />
              Способ 2 — по коду
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Если номер не совпал — выдайте мастеру код, он введёт его в приложении. Код живёт 24 часа.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              {code ? (
                <>
                  <div className="rounded-lg border-2 border-dashed border-neutral-300 px-4 py-2 font-mono text-lg font-bold tracking-widest text-neutral-900">
                    {code}
                  </div>
                  <button
                    onClick={copyCode}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Скопировать
                  </button>
                  <button
                    onClick={makeCode}
                    disabled={pending}
                    className="text-xs text-neutral-500 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
                  >
                    Новый код
                  </button>
                </>
              ) : (
                <button
                  onClick={makeCode}
                  disabled={pending}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                >
                  {pending ? "Создаём…" : "Создать код привязки"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
