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

// Загружает документ в ПРИВАТНЫЙ бакет docs (RLS: только админ).
// Возвращает путь внутри бакета — прямых публичных ссылок у него нет.
export async function uploadDocument(
  file: File,
  specialistId: string,
): Promise<{ path: string; mime: string; size: number }> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${specialistId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("docs")
    .upload(path, file, { cacheControl: "0", upsert: false });

  if (error) throw new Error(error.message);

  return { path, mime: file.type || "application/octet-stream", size: file.size };
}
