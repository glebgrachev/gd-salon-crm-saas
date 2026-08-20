"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendReactivationNow } from "./actions";
import ProModal from "@/components/ProModal";
import { hasModule } from "@/lib/modules";

export default function RetentionResetButton({
  clientId,
  alreadySent,
  shopModules,
}: {
  clientId: number;
  alreadySent: boolean;
  shopModules?: Record<string, any> | null;
}) {
  const [pending, startTransition] = useTransition();
  const [showProModal, setShowProModal] = useState(false);
  const router = useRouter();

  const hasRetention = hasModule(shopModules, "retention");
  const label = alreadySent ? "Отправить снова" : "Отправить";

  const handleClick = () => {
    if (!hasRetention) {
      setShowProModal(true);
      return;
    }

    startTransition(async () => {
      const r = await sendReactivationNow(clientId);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
      else {
        toast.success("Сообщение отправлено клиенту");
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-medium text-neutral-700 underline underline-offset-2 hover:text-neutral-900 disabled:opacity-50"
      >
        {pending ? "Отправляем…" : label}
      </button>

      <ProModal
        isOpen={showProModal}
        onClose={() => setShowProModal(false)}
        moduleName="Возвращаемость"
        type="module"
      />
    </>
  );
}