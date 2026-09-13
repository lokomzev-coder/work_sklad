"use client";

import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { uploadAttachment, deleteAttachment } from "@/actions/attachments";

export interface AttachmentRow {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdByName: string;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/** МойСклад's document/product file attachments — one generic component for
 * both: a CatalogItem's image gallery and any document's file list, since
 * both are backed by the same polymorphic Attachment model (see its schema
 * comment). `imageGallery` switches between a thumbnail grid (for product
 * images) and a plain file-list layout (for document attachments). */
export function AttachmentList({
  orgSlug,
  entityType,
  entityId,
  revalidateHref,
  attachments,
  imageGallery = false,
  title = "Файлы",
}: {
  orgSlug: string;
  entityType: string;
  entityId: string;
  revalidateHref: string;
  attachments: AttachmentRow[];
  imageGallery?: boolean;
  title?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const result = await uploadAttachment(orgSlug, entityType, entityId, revalidateHref, formData);
      if (result.error) toast.error(result.error);
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteAttachment(orgSlug, id, revalidateHref);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {attachments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет файлов</p>
        ) : imageGallery ? (
          <div className="flex flex-wrap gap-3">
            {attachments
              .filter((a) => a.mimeType.startsWith("image/"))
              .map((a) => (
                <div key={a.id} className="group relative">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated /api/files/[id] source, not a static asset next/image can optimize */}
                  <img
                    src={`/api/files/${a.id}`}
                    alt={a.fileName}
                    className="size-24 rounded-md border object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute -top-2 -right-2 size-6 rounded-full p-0 opacity-0 group-hover:opacity-100"
                    disabled={isPending}
                    onClick={() => handleDelete(a.id)}
                  >
                    ×
                  </Button>
                </div>
              ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                <a href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
                  {a.fileName}
                </a>
                <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatSize(a.sizeBytes)}</span>
                  <span>{a.createdByName}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() => handleDelete(a.id)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div>
          <input ref={fileInputRef} type="file" onChange={handleFileChange} disabled={isPending} className="text-sm" />
        </div>
      </CardContent>
    </Card>
  );
}
