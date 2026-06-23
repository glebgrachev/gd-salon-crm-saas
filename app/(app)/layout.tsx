import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await supabase.rpc("is_admin");
  if (!isAdmin) redirect("/access-denied");

  return (
    <div className="flex h-screen bg-neutral-50">
      <Sidebar email={user.email} />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <Toaster position="top-center" />
    </div>
  );
}
