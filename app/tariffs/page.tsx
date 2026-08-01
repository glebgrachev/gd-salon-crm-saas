import { Suspense } from "react";
import TariffsPageContent from "./TariffsPageContent";

export default function TariffsPage() {
  return (
    <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-neutral-500">Загрузка...</div>}>
      <TariffsPageContent />
    </Suspense>
  );
}