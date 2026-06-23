import { createClient } from "@/lib/supabase/client";

// Загружает файл в бакет media под авторизованным админом (RLS это разрешает)
// и возвращает публичный URL. folder — подпапка ('team' | 'portfolio').
export async function uploadImage(file: File, folder: string): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("media")
    .upload(path, file, { cacheControl: "3600", upsert: false });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("media").getPublicUrl(path);
  return data.publicUrl;
}
