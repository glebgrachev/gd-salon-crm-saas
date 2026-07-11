"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetRetentionNotification } from "./actions";

export default function RetentionResetButton({ clientId }: { clientId: number }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          const r = await resetRetentionNotification(clientId);
          if (!r.ok) toast.error(r.error ?? "Ошибка");
          else {
            toast.success("Отметка сброшена — напоминание отправится в следующую рассылку");
            router.refresh();
          }
        })
      }
      disabled={pending}
      className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
    >
      {pending ? "Сбрасываем…" : "Отправить снова"}
    </button>
  );
}
