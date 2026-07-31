"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function PaymentSuccessClient() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const paymentIdFromUrl = searchParams.get("payment_id");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Ожидание оплаты...");
  const [paymentId, setPaymentId] = useState<string | null>(paymentIdFromUrl);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [shopId, setShopId] = useState<number | null>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data: admin } = await supabase
        .from("admins")
        .select("shop_id")
        .eq("user_uid", user.id)
        .single();

      if (!admin?.shop_id) {
        setStatus("error");
        setMessage("Салон не найден");
        return;
      }

      setShopId(admin.shop_id);

      // Если payment_id не передан в URL — ищем последний pending платёж
      if (!paymentId) {
        const { data: payment } = await supabase
          .from("payments")
          .select("provider_payment_id")
          .eq("shop_id", admin.shop_id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (payment?.provider_payment_id) {
          setPaymentId(payment.provider_payment_id);
        } else {
          setStatus("error");
          setMessage("Платёж не найден");
          return;
        }
      }

      // Запускаем периодическую проверку
      startPolling(admin.shop_id);
    }

    init();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const startPolling = (shopId: number) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 60 * 2 сек = 2 минуты

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      attempts++;
      console.log(`⏳ Проверка платежа #${attempts}, payment_id: ${paymentId}`);

      if (!paymentId) {
        setStatus("error");
        setMessage("Нет ID платежа");
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      try {
        const response = await fetch(
          "https://cmzqpjfckzftlptrozdf.supabase.co/functions/v1/check-payment",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_id: paymentId }),
          }
        );

        const result = await response.json();

        if (result.status === "succeeded") {
          // ✅ Оплата прошла → обновляем тариф
          await updateTariff(shopId);
          setStatus("success");
          setMessage("🎉 Оплата прошла успешно! Тариф активирован.");
          if (intervalRef.current) clearInterval(intervalRef.current);
          toast.success("Тариф активирован!");
          setTimeout(() => router.push("/"), 3000);
        } else if (result.status === "canceled") {
          // ❌ Оплата отменена
          setStatus("error");
          setMessage("❌ Платёж был отменён. Попробуйте снова.");
          if (intervalRef.current) clearInterval(intervalRef.current);
          // Обновляем статус платежа в БД
          await supabase
            .from("payments")
            .update({ status: "canceled" })
            .eq("provider_payment_id", paymentId);
          toast.error("Платёж отменён");
        } else if (result.status === "pending") {
          // ⏳ Всё ещё ждём
          setMessage("Ожидаем подтверждения оплаты...");
        } else {
          // ❌ Неизвестный статус
          if (attempts > 3) {
            setStatus("error");
            setMessage("Не удалось определить статус платежа. Попробуйте обновить страницу.");
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        }
      } catch (error) {
        console.error("Ошибка проверки статуса:", error);
        if (attempts > 3) {
          setStatus("error");
          setMessage("Ошибка при проверке платежа. Попробуйте обновить страницу.");
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }

      // Прерываем по таймауту
      if (attempts >= MAX_ATTEMPTS) {
        setStatus("error");
        setMessage("⏰ Время ожидания истекло. Проверьте статус платежа в истории.");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 2000); // Каждые 2 секунды
  };

  const updateTariff = async (shopId: number) => {
    try {
      const { data: payment } = await supabase
        .from("payments")
        .select("*")
        .eq("shop_id", shopId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!payment) return;

      await supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", payment.id);

      const { data: plan } = await supabase
        .from("plans")
        .select("modules")
        .eq("id", payment.plan_id)
        .single();

      if (plan) {
        const modules = (plan.modules as string[]).reduce((acc, key) => {
          acc[key] = true;
          return acc;
        }, {} as Record<string, boolean>);

        await supabase
          .from("shops")
          .update({
            plan: String(payment.plan_id),
            modules: modules,
            subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("id", shopId);
      }
    } catch (error) {
      console.error("Ошибка обновления тарифа:", error);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center mb-4">
          {status === "loading" && <Loader2 className="h-12 w-12 animate-spin text-neutral-400" />}
          {status === "success" && <CheckCircle className="h-12 w-12 text-emerald-500" />}
          {status === "error" && <XCircle className="h-12 w-12 text-red-500" />}
        </div>

        <h1 className="text-lg font-semibold text-neutral-900">
          {status === "loading" ? "Ожидание оплаты" : status === "success" ? "Оплата прошла успешно!" : "Ошибка оплаты"}
        </h1>
        <p className="mt-2 text-sm text-neutral-500">{message}</p>

        {status === "loading" && (
          <p className="mt-4 text-xs text-neutral-400">
            Пожалуйста, не закрывайте страницу. Оплата обрабатывается...
          </p>
        )}

        {status !== "loading" && (
          <button
            onClick={() => router.push(status === "success" ? "/" : "/tariffs")}
            className="mt-6 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            {status === "success" ? "Перейти в админку" : "Попробовать снова"}
          </button>
        )}
      </div>
    </div>
  );
}