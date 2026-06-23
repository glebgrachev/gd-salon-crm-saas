"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Star, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setReviewStatus } from "./actions";

export type Review = {
  id: string;
  specialist_rating: number | null;
  service_rating: number | null;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  client: { first_name: string | null; last_name: string | null; username: string | null } | null;
  service: { name: string } | null;
};

const STATUS: Record<Review["status"], { label: string; className: string }> = {
  pending: {
    label: "На модерации",
    className: "bg-amber-100 text-amber-700 border-amber-200",
  },
  approved: {
    label: "Опубликован",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  rejected: {
    label: "Отклонён",
    className: "bg-neutral-100 text-neutral-500 border-neutral-200",
  },
};

function clientName(c: Review["client"]) {
  if (!c) return "Клиент";
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return full || (c.username ? "@" + c.username : "Клиент");
}

function fmt(iso: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(iso));
}

function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-neutral-300">—</span>;
  return (
    <span className="inline-flex">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          size={13}
          className={
            i < n ? "fill-amber-400 text-amber-400" : "text-neutral-200"
          }
        />
      ))}
    </span>
  );
}

export default function SpecialistReviews({
  specialistId,
  reviews,
}: {
  specialistId: string;
  reviews: Review[];
}) {
  const [pending, startTransition] = useTransition();

  function set(id: string, status: Review["status"]) {
    startTransition(async () => {
      const r = await setReviewStatus(specialistId, id, status);
      if (!r.ok) toast.error(r.error ?? "Ошибка");
    });
  }

  return (
    <section className="mx-auto max-w-3xl px-8 pb-12">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">Отзывы</h2>

      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white px-8 py-12 text-center text-sm text-neutral-500">
          Отзывов пока нет.
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-neutral-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-neutral-900">
                    {clientName(r.client)}
                  </div>
                  <div className="text-xs text-neutral-400">
                    {r.service?.name ?? ""} · {fmt(r.created_at)}
                  </div>
                </div>
                <Badge variant="outline" className={STATUS[r.status].className}>
                  {STATUS[r.status].label}
                </Badge>
              </div>

              <div className="mt-2 flex items-center gap-4 text-xs text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  Мастер: <Stars n={r.specialist_rating} />
                </span>
                <span className="inline-flex items-center gap-1">
                  Услуга: <Stars n={r.service_rating} />
                </span>
              </div>

              {r.comment && (
                <p className="mt-2 text-sm text-neutral-700">{r.comment}</p>
              )}

              <div className="mt-3 flex gap-2">
                {r.status !== "approved" && (
                  <Button
                    size="sm"
                    onClick={() => set(r.id, "approved")}
                    disabled={pending}
                  >
                    <Check /> Опубликовать
                  </Button>
                )}
                {r.status !== "rejected" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => set(r.id, "rejected")}
                    disabled={pending}
                  >
                    <X /> Отклонить
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
