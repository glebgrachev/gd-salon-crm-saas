import { createAdmin } from "@/lib/supabase/admin";
import { validateInitData } from "@/lib/telegram";
import { json, options } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function OPTIONS() { return options(); }

type Row = {
  id: string;
  qty: number;
  price: number;
  total: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  product: { name: string; photo_url: string | null } | null;
};

// Мои отложенные и купленные товары
export async function POST(req: Request) {
  let body: { initData?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const user = validateInitData(body.initData ?? "", process.env.TELEGRAM_BOT_TOKEN!);
  if (!user) return json({ error: "unauthorized" }, 401);

  const admin = createAdmin();
  const { data } = await admin
    .from("product_sales")
    .select("id, qty, price, total, status, created_at, paid_at, product:products ( name, photo_url )")
    .eq("client_id", user.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (data as unknown as Row[]) ?? [];

  return json({
    ok: true,
    items: rows.map((r) => ({
      id: r.id,
      name: r.product?.name ?? "Товар",
      photo_url: r.product?.photo_url ?? null,
      qty: Number(r.qty),
      price: Number(r.price),
      total: Number(r.total),
      status: r.status,
      created_at: r.created_at,
      paid_at: r.paid_at,
    })),
  });
}
