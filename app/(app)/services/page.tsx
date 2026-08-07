import { createClient } from "@/lib/supabase/server";
import ServicesManager, {
  type Category,
  type Service,
} from "./services-manager";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const supabase = await createClient();

  // 1. Получаем пользователя и shop_id
  const { data: { user } } = await supabase.auth.getUser();

  const { data: admin } = await supabase
    .from("admins")
    .select("shop_id")
    .eq("user_uid", user?.id)
    .single();

  const shopId = admin?.shop_id ?? 0;

  // 2. Загружаем категории и услуги ТОЛЬКО для этого салона
  const [{ data: cats }, { data: svcs }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, parent_id, name, level, sort_order, image_url") // 👈 Добавили image_url
      .eq("shop_id", shopId)
      .order("level")
      .order("sort_order")
      .order("name"),
    supabase
      .from("services")
      .select("id, category_id, name, duration_min, image_url, description, price") // 👈 Добавили image_url, description, price
      .eq("shop_id", shopId)
      .order("name"),
  ]);

  return (
    <ServicesManager
      categories={(cats as Category[]) ?? []}
      services={(svcs as Service[]) ?? []}
    />
  );
}