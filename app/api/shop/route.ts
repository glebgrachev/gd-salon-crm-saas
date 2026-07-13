import { createAdmin } from "@/lib/supabase/admin";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

// Витрина: товары в наличии и подарочные сертификаты
export async function GET() {
  const admin = createAdmin();
  const { data, error } = await admin
    .from("v_shop_products")
    .select("id, kind, name, photo_url, description, price, face_value, validity_days")
    .order("kind")      // certificate, sale
    .order("price");

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, products: data ?? [] });
}
