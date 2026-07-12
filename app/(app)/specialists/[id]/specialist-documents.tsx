"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, Loader2, Trash2, Download, Eye, EyeOff } from "lucide-react";
import { uploadDocument } from "@/lib/upload";
import {
  addDocument,
  deleteDocument,
  toggleDocumentPublic,
  getDocumentUrl,
  type DocType,
} from "./actions";

export type SpecDocument = {
  id: string;
  doc_type: DocType;
  title: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  expires_at: string | null;
  is_public: boolean;
  created_at: string;
  expiry_status: "none" | "valid" | "expiring" | "expired";
  days_left: number | null;
};

const TYPE_LABEL: Record<DocType, string> = {
  diploma: "Диплом",
  certificate: "Сертификат",
  license: "Лицензия",
  medical: "Медкнижка",
  contract: "Договор",
  other: "Прочее",
};

// какие типы имеет смысл показывать клиентам
const PUBLIC_FRIENDLY: DocType[] = ["diploma", "certificate", "license"];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    new Date(iso),
  );
}

function fmtSize(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  return `${(b / 1024 / 1024).toFixed(1)} МБ`;
}

export default function SpecialistDocuments({
  specialistId,
  documents,
}: {
  specialistId: string;
  documents: SpecDocument[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<DocType>("diploma");
  const [expiresAt, setExpiresAt] = useState("");
  const [isPublic, setIsPublic] = useState(false);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title.trim()) {
      toast.error("Сначала укажите название документа");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл больше 10 МБ");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const { path, mime, size } = await uploadDocument(file, specialistId);
      const r = await addDocument({
        specialistId,
        docType,
        title,
        filePath: path,
        mimeType: mime,
        sizeBytes: size,
        expiresAt: expiresAt || null,
        isPublic,
      });
      if (r.ok) {
        toast.success("Документ добавлен");
        setTitle("");
        setExpiresAt("");
        setIsPublic(false);
        router.refresh();
      } else {
        toast.error(r.error ?? "Не удалось сохранить");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function download(id: string) {
    const r = await getDocumentUrl(specialistId, id);
    if (r.ok) window.open(r.url, "_blank");
    else toast.error(r.error);
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteDocument(specialistId, id);
      if (r.ok) {
        toast.success("Документ удалён");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  function togglePublic(id: string, next: boolean) {
    startTransition(async () => {
      const r = await toggleDocumentPublic(specialistId, id, next);
      if (r.ok) {
        toast.success(next ? "Документ виден клиентам" : "Документ скрыт от клиентов");
        router.refresh();
      } else {
        toast.error(r.error ?? "Ошибка");
      }
    });
  }

  const expiringCount = documents.filter(
    (d) => d.expiry_status === "expiring" || d.expiry_status === "expired",
  ).length;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">Документы</h2>
        {expiringCount > 0 && (
          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            {expiringCount} требуют внимания
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        Файлы хранятся приватно. Дипломы и сертификаты можно показать клиентам в приложении.
      </p>

      {/* форма добавления */}
      <div className="mt-5 rounded-lg border border-dashed border-neutral-300 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-neutral-500">Название</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Диплом парикмахера-стилиста"
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-500">Тип</label>
            <select
              value={docType}
              onChange={(e) => {
                const t = e.target.value as DocType;
                setDocType(t);
                if (!PUBLIC_FRIENDLY.includes(t)) setIsPublic(false);
              }}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            >
              {(Object.keys(TYPE_LABEL) as DocType[]).map((k) => (
                <option key={k} value={k}>
                  {TYPE_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-neutral-500">Действует до (необязательно)</label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex items-end">
            <label
              className={`flex items-center gap-2 text-xs ${
                PUBLIC_FRIENDLY.includes(docType) ? "text-neutral-700" : "text-neutral-400"
              }`}
            >
              <input
                type="checkbox"
                checked={isPublic}
                disabled={!PUBLIC_FRIENDLY.includes(docType)}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              Показывать клиентам в приложении
            </label>
          </div>
        </div>

        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={onFile}
            className="hidden"
            id="doc-file"
          />
          <label
            htmlFor="doc-file"
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 ${
              uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? "Загружаем…" : "Загрузить файл"}
          </label>
          <span className="ml-3 text-xs text-neutral-400">PDF, JPG, PNG · до 10 МБ</span>
        </div>
      </div>

      {/* список */}
      <div className="mt-5 space-y-2">
        {documents.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-200 px-4 py-8 text-center text-sm text-neutral-400">
            Документов пока нет.
          </div>
        )}

        {documents.map((d) => {
          const st =
            d.expiry_status === "expired"
              ? { label: "Истёк", cls: "bg-red-100 text-red-600" }
              : d.expiry_status === "expiring"
              ? { label: `Истекает через ${d.days_left} дн.`, cls: "bg-amber-100 text-amber-700" }
              : d.expiry_status === "valid"
              ? { label: `До ${fmtDate(d.expires_at)}`, cls: "bg-emerald-100 text-emerald-700" }
              : null;

          const canBePublic = PUBLIC_FRIENDLY.includes(d.doc_type);

          return (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-neutral-900">{d.title}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                  <span>{TYPE_LABEL[d.doc_type]}</span>
                  {d.size_bytes ? <span>· {fmtSize(d.size_bytes)}</span> : null}
                  <span>· добавлен {fmtDate(d.created_at)}</span>
                </div>
              </div>

              {st && (
                <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
              )}

              {canBePublic && (
                <button
                  onClick={() => togglePublic(d.id, !d.is_public)}
                  disabled={pending}
                  title={d.is_public ? "Скрыть от клиентов" : "Показать клиентам"}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    d.is_public
                      ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
                  }`}
                >
                  {d.is_public ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  {d.is_public ? "Виден клиентам" : "Скрыт"}
                </button>
              )}

              <button
                onClick={() => download(d.id)}
                title="Скачать"
                className="rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
              >
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => remove(d.id)}
                disabled={pending}
                title="Удалить"
                className="rounded-md p-1.5 text-neutral-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
