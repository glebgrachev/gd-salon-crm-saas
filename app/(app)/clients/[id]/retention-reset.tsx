"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendReactivationNow } from "./actions";

export default function RetentionResetButton({ clientId }: { clientId: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const r = await sendReactivationNow(clientId);
          if (!r.ok) toast.error(r.error ?? "Ошибка");
          else {
            toast.success("Сообщение отправлено клиенту");
            router.refresh();
          }
        })
      }
      disabled={pending}
      className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
    >
      {pending ? "Отправляем…" : "Отправить снова"}
    </button>
  );
}
