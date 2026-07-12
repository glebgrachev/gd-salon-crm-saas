import { createClient } from "@/lib/supabase/server";
import StockClient from "./stock-client";
import type { ProductRow, SupplierRow } from "./actions";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const supabase = await createClient();

  const [{ data: products }, { data: suppliers }] = await Promise.all([
    supabase.from("v_products").select("*").order("kind", { ascending: false }).order("name"),
    supabase.from("suppliers").select("*").eq("is_active", true).order("name"),
  ]);

  return (
    <StockClient
      products={(products as ProductRow[]) ?? []}
      suppliers={(suppliers as SupplierRow[]) ?? []}
    />
  );
}
