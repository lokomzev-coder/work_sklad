"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createApiKey, revokeApiKey } from "@/actions/api-keys";

export interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export function ApiKeysManager({ orgSlug, apiKeys }: { orgSlug: string; apiKeys: ApiKeyRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createApiKey(orgSlug, name.trim());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setName("");
      setFreshKey(result.plaintextKey ?? null);
    });
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const result = await revokeApiKey(orgSlug, id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Ключ отозван");
    });
  }

  function handleCopy() {
    if (!freshKey) return;
    navigator.clipboard.writeText(freshKey).then(() => toast.success("Скопировано"));
  }

  return (
    <div className="flex flex-col gap-6">
      {freshKey && (
        <div className="flex flex-col gap-2 rounded-md border border-primary bg-primary/5 p-4">
          <p className="text-sm font-medium">
            Ключ создан — сохраните его сейчас, второй раз он не покажется:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-2 py-1.5 text-sm break-all">{freshKey}</code>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="size-4" />
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setFreshKey(null)}>
            Скрыть
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">Название ключа</label>
          <Input
            placeholder="Например: интеграция с 1С"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" className="self-start" disabled={isPending || !name.trim()} onClick={handleCreate}>
          Создать ключ
        </Button>
      </div>

      {apiKeys.length === 0 ? (
        <p className="text-sm text-muted-foreground">API-ключи ещё не созданы</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название</TableHead>
                <TableHead>Ключ</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Последнее использование</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apiKeys.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{key.keyPrefix}…</TableCell>
                  <TableCell>
                    <Badge variant={key.revokedAt ? "secondary" : "default"}>
                      {key.revokedAt ? "Отозван" : "Активен"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{key.lastUsedAt ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{key.createdAt}</TableCell>
                  <TableCell className="text-right">
                    {!key.revokedAt && (
                      <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleRevoke(key.id)}>
                        <X className="size-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
