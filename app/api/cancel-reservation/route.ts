import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

/**
 * Клиент сам отменяет резерв товара — тот возвращается в продажу.
 * Отменить можно только СВОЙ резерв и только пока он не оплачен.
 */
export async function POST(req: Request) {
  let body: { initData?: string; sale_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!body.sale_id) return json({ error: "bad_request" }, 400);

  const admin = createAdmin();

  // резерв должен принадлежать этому клиенту и быть неоплаченным
  const { data: sale } = await admin
    .from("product_sales")
    .select("id, client_id, status")
    .eq("id", body.sale_id)
    .maybeSingle();

  if (!sale) return json({ ok: false, error: "not_found" }, 404);
  if (Number(sale.client_id) !== Number(user.id)) {
    return json({ ok: false, error: "forbidden" }, 403);
  }
  if (sale.status !== "reserved") {
    return json({ ok: false, error: "not_reserved" }, 409);
  }

  const { data, error } = await admin.rpc("cancel_product_sale", { p_sale: body.sale_id });
  if (error) return json({ ok: false, error: error.message }, 500);

  const res = data as { ok?: boolean };
  return json({ ok: res?.ok === true });
}
