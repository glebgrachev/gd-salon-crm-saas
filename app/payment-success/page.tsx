"use client";

import { Suspense } from "react";
import { useEffect, useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

const PUBLISHABLE_KEY = "sb_publishable_vTWBLzZsUEq475a6qRKhuw_WP3XiiCX";

function PaymentSuccessContent() {
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
      try {
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
            console.log(`🔍 Найден provider_payment_id: ${payment.provider_payment_id}`);
          } else {
            const { data: shop } = await supabase
              .from("shops")
              .select("plan_id")
              .eq("id", admin.shop_id)
              .single();

            if (shop?.plan_id !== 1 && shop?.plan_id !== null) {
              setStatus("success");
              setMessage("Тариф уже активирован!");
              return;
            }

            setStatus("error");
            setMessage("Платёж не найден");
            return;
          }
        } else {
          console.log(`🔍 payment_id из URL: ${paymentId}`);
        }

        console.log("⏳ Запуск первой проверки...");
        await checkStatus(admin.shop_id);

        startPolling(admin.shop_id);
      } catch (error) {
        console.error("❌ Ошибка инициализации:", error);
        setStatus("error");
        setMessage("Произошла ошибка при инициализации");
      }
    }

    init();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const checkStatus = async (shopId: number): Promise<boolean> => {
    console.log(`📊 Проверка статуса для payment_id: ${paymentId}`);

    if (!paymentId) {
      console.log("❌ Нет payment_id для проверки");
      return false;
    }

    try {
      const response = await fetch(
        "https://cmzqpjfckzftlptrozdf.supabase.co/functions/v1/check-payment",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            payment_id: paymentId,
            shop_id: shopId,
          }),
        }
      );

      console.log(`📨 Ответ от check-payment: статус ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`❌ Ошибка check-payment: ${errorText}`);
        return false;
      }

      const result = await response.json();
      console.log(`📊 Результат:`, result);

      if (result.status === "succeeded") {
        await updateTariff(shopId);
        setStatus("success");
        setMessage("🎉 Оплата прошла успешно! Тариф активирован.");
        if (intervalRef.current) clearInterval(intervalRef.current);
        toast.success("Тариф активирован!");
        setTimeout(() => router.push("/"), 3000);
        return true;
      } else if (result.status === "canceled") {
        setStatus("error");
        setMessage("❌ Платёж был отменён. Попробуйте снова.");
        if (intervalRef.current) clearInterval(intervalRef.current);
        await supabase
          .from("payments")
          .update({ status: "canceled" })
          .eq("provider_payment_id", paymentId);
        toast.error("Платёж отменён");
        return true;
      } else if (result.status === "pending") {
        setMessage("Ожидаем подтверждения оплаты...");
        return false;
      } else {
        console.log(`❌ Неизвестный статус: ${result.status}`);
        return false;
      }
    } catch (error) {
      console.error("❌ Ошибка при проверке статуса:", error);
      return false;
    }
  };

  const startPolling = (shopId: number) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 30;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(async () => {
      attempts++;
      console.log(`⏳ Проверка платежа #${attempts}`);
      const completed = await checkStatus(shopId);

      if (completed) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        return;
      }

      if (attempts >= MAX_ATTEMPTS) {
        setStatus("error");
        setMessage("⏰ Время ожидания истекло. Проверьте статус платежа в истории.");
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 2000);
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

      if (!payment) {
        console.log("❌ Нет pending платежа для обновления");
        return;
      }

      console.log(`✅ Обновление платежа ${payment.id} на status=paid`);

      await supabase
        .from("payments")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", payment.id);

      console.log(`✅ Обновление тарифа для shop_id=${shopId}, plan_id=${payment.plan_id}`);

      await supabase
        .from("shops")
        .update({
          plan_id: payment.plan_id,
          subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", shopId);
    } catch (error) {
      console.error("❌ Ошибка обновления тарифа:", error);
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

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-neutral-500">Загрузка...</div>}>
      <PaymentSuccessContent />
    </Suspense>
  );
}