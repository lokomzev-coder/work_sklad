"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createComment, deleteComment } from "@/actions/comments";

export interface CommentRow {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
  isOwn: boolean;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** МойСклад's eventfeed, simplified to just manual comments (not system
 * events like status changes — those already have their own, separate audit
 * trail, see Настройки → Журнал изменений). */
export function EventFeed({
  orgSlug,
  entityType,
  entityId,
  revalidateHref,
  comments,
}: {
  orgSlug: string;
  entityType: string;
  entityId: string;
  revalidateHref: string;
  comments: CommentRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");

  function handleAdd() {
    if (!text.trim()) return;
    startTransition(async () => {
      const result = await createComment(orgSlug, entityType, entityId, text, revalidateHref);
      if (result.error) toast.error(result.error);
      else setText("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Комментарии</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока нет комментариев</p>
        ) : (
          <div className="flex flex-col gap-3">
            {comments.map((c) => (
              <div key={c.id} className="flex flex-col gap-1 rounded-md border p-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{c.authorName}</span>
                  <span>{formatDateTime(c.createdAt)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.text}</p>
                {c.isOwn && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit text-destructive hover:text-destructive"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteComment(orgSlug, c.id, revalidateHref);
                        if (result.error) toast.error(result.error);
                      })
                    }
                  >
                    Удалить
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Textarea placeholder="Написать комментарий..." rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="button" size="sm" className="w-fit" disabled={isPending || !text.trim()} onClick={handleAdd}>
            Отправить
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
