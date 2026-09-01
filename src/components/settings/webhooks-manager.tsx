"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createWebhook, toggleWebhookActive, deleteWebhook } from "@/actions/webhooks";
import type { WebhookEvent } from "@/generated/prisma/enums";

const EVENT_LABELS: Record<WebhookEvent, string> = {
  ORDER_CREATED: "Заказ создан",
  ORDER_STATUS_CHANGED: "Статус заказа изменён",
  PURCHASE_ORDER_CREATED: "Заказ поставщику создан",
  PURCHASE_ORDER_STATUS_CHANGED: "Статус заказа поставщику изменён",
  PAYMENT_CREATED: "Платёж создан",
  PRODUCTION_ORDER_CREATED: "Производственное задание создано",
  PRODUCTION_ORDER_STATUS_CHANGED: "Статус производственного задания изменён",
  PRODUCTION_ORDER_COMPLETED: "Производство выполнено (полностью или частично)",
};

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  isActive: boolean;
  deliveries: { success: boolean; createdAt: string; statusCode: number | null; error: string | null }[];
}

export function WebhooksManager({ orgSlug, webhooks }: { orgSlug: string; webhooks: WebhookRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([]);

  function handleCreate() {
    if (!url.trim() || events.length === 0) return;
    const formData = new FormData();
    formData.set("url", url.trim());
    events.forEach((e) => formData.append("events", e));
    startTransition(async () => {
      const result = await createWebhook(orgSlug, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setUrl("");
        setEvents([]);
        toast.success("Вебхук добавлен");
      }
    });
  }

  function handleToggle(id: string, isActive: boolean) {
    startTransition(async () => {
      await toggleWebhookActive(orgSlug, id, isActive);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteWebhook(orgSlug, id);
      toast.success("Вебхук удалён");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">URL эндпоинта</label>
          <Input placeholder="https://example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">События</span>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(EVENT_LABELS) as WebhookEvent[]).map((event) => (
              <label key={event} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={events.includes(event)}
                  onCheckedChange={(checked) =>
                    setEvents((prev) => (checked ? [...prev, event] : prev.filter((e) => e !== event)))
                  }
                />
                {EVENT_LABELS[event]}
              </label>
            ))}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={isPending || !url.trim() || events.length === 0}
          onClick={handleCreate}
        >
          Добавить вебхук
        </Button>
      </div>

      {webhooks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Вебхуки ещё не добавлены</p>
      ) : (
        <div className="flex flex-col gap-4">
          {webhooks.map((w) => (
            <div key={w.id} className="rounded-md border p-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{w.url}</span>
                  <span className="text-xs text-muted-foreground">Секрет: {w.secret}</span>
                  <div className="flex flex-wrap gap-1">
                    {w.events.map((e) => (
                      <Badge key={e} variant="secondary">
                        {EVENT_LABELS[e]}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={w.isActive}
                      disabled={isPending}
                      onCheckedChange={(checked) => handleToggle(w.id, checked === true)}
                    />
                    Активен
                  </label>
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(w.id)}>
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
              {w.deliveries.length > 0 && (
                <div className="mt-3 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Когда</TableHead>
                        <TableHead>Результат</TableHead>
                        <TableHead>Код</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {w.deliveries.map((d, i) => (
                        <TableRow key={i}>
                          <TableCell>{d.createdAt}</TableCell>
                          <TableCell>
                            <Badge variant={d.success ? "default" : "destructive"}>
                              {d.success ? "Успех" : "Ошибка"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {d.statusCode ?? d.error ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
