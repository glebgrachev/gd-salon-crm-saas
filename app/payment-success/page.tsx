"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckCircle, Loader2, XCircle } from "lucide-react";

export default function PaymentSuccessPage() {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Проверяем статус оплаты...");

  useEffect(() => {
    async function checkPayment() {
      try {
        console.log("🔍 Проверка платежа...");

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log("❌ Пользователь не авторизован");
          router.push("/login");
          return;
        }

        // Получаем shop_id
        const { data: admin } = await supabase
          .from("admins")
          .select("shop_id")
          .eq("user_uid", user.id)
          .single();

        if (!admin?.shop_id) {
          console.log("❌ Салон не найден");
          setStatus("error");
          setMessage("Салон не найден");
          return;
        }

        console.log(`🏪 Shop ID: ${admin.shop_id}`);

        // Находим последний ожидающий платёж
        const { data: payment } = await supabase
          .from("payments")
          .select("*")
          .eq("shop_id", admin.shop_id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (!payment) {
          console.log("ℹ️ Нет ожидающих платежей");

          // Проверяем, может тариф уже обновился
          const { data: shop } = await supabase
            .from("shops")
            .select("plan")
            .eq("id", admin.shop_id)
            .single();

          if (shop?.plan !== "free") {
            setStatus("success");
            setMessage("Тариф уже активирован!");
            return;
          }

          setStatus("error");
          setMessage("Платёж не найден");
          return;
        }

        console.log(`💳 Найден платёж: ID=${payment.id}, provider_payment_id=${payment.provider_payment_id}`);

        if (!payment.provider_payment_id) {
          console.log("❌ Нет provider_payment_id");
          setStatus("error");
          setMessage("Ошибка: нет ID платежа в Юкассе");
          return;
        }

        // 🔥 Проверяем статус в Юкассе
        const response = await fetch(
          "https://cmzqpjfckzftlptrozdf.supabase.co/functions/v1/check-payment",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ payment_id: payment.provider_payment_id }),
          }
        );

        console.log(`📨 Ответ от check-payment: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`❌ Ошибка: ${errorText}`);
          setStatus("error");
          setMessage("Ошибка при проверке платежа");
          return;
        }

        const result = await response.json();
        console.log(`📊 Статус платежа: ${result.status}`);

        if (result.status === "succeeded") {
          console.log("✅ Платёж успешен! Обновляем тариф...");

          // Обновляем статус платежа
          await supabase
            .from("payments")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", payment.id);

          // Получаем модули для тарифа
          const { data: plan } = await supabase
            .from("plans")
            .select("modules")
            .eq("id", payment.plan_id)
            .single();

          // Обновляем тариф салона
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
              .eq("id", admin.shop_id);

            console.log(`✅ Тариф обновлён на ${payment.plan_id}`);
          }

          setStatus("success");
          setMessage("🎉 Оплата прошла успешно! Тариф активирован.");
        } else if (result.status === "pending") {
          console.log("⏳ Платёж в обработке...");
          setMessage("Ожидаем подтверждения оплаты...");
          setTimeout(() => checkPayment(), 3000);
        } else {
          console.log(`❌ Неизвестный статус: ${result.status}`);
          setStatus("error");
          setMessage("Оплата не прошла. Попробуйте снова.");
        }
      } catch (error) {
        console.error("🔥 Ошибка:", error);
        setStatus("error");
        setMessage("Произошла ошибка при проверке платежа");
      }
    }

    checkPayment();
  }, [router, supabase]);

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

        {status !== "loading" && (
          <button
            onClick={() => router.push(status === "success" ? "/" : "/tariffs")}
            className="mt-6 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
          >
            {status === "success" ? "Перейти в админку" : "Попробовать снова"}
          </button>
        )}

        {status === "loading" && (
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Проверить снова
          </button>
        )}
      </div>
    </div>
  );
}