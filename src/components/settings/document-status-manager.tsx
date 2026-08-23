"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowUp, ArrowDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  createDocumentStatus,
  renameDocumentStatus,
  toggleFinalStatus,
  moveDocumentStatus,
  deleteDocumentStatus,
} from "@/actions/document-statuses";
import type { DocumentStatusKind } from "@/generated/prisma/enums";

interface StatusRow {
  id: string;
  name: string;
  color: string;
  isFinal: boolean;
  position: number;
}

const COLORS = ["gray", "blue", "green", "red", "orange", "purple"];

export function DocumentStatusManager({
  orgSlug,
  kind,
  statuses,
}: {
  orgSlug: string;
  kind: DocumentStatusKind;
  statuses: StatusRow[];
}) {
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("gray");

  function handleRename(id: string, name: string) {
    startTransition(async () => {
      const result = await renameDocumentStatus(orgSlug, id, name);
      if (result.error) toast.error(result.error);
    });
  }

  function handleToggleFinal(id: string, isFinal: boolean) {
    startTransition(async () => {
      await toggleFinalStatus(orgSlug, id, isFinal);
    });
  }

  function handleMove(id: string, direction: "up" | "down") {
    startTransition(async () => {
      await moveDocumentStatus(orgSlug, id, direction);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteDocumentStatus(orgSlug, id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Статус удалён");
      }
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const formData = new FormData();
    formData.set("name", newName.trim());
    formData.set("color", newColor);
    startTransition(async () => {
      const result = await createDocumentStatus(orgSlug, kind, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setNewName("");
      }
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0" />
            <TableHead>Название</TableHead>
            <TableHead>Финальный статус</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {statuses.map((s, i) => (
            <TableRow key={s.id}>
              <TableCell>
                <div className="flex flex-col">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1"
                    disabled={isPending || i === 0}
                    onClick={() => handleMove(s.id, "up")}
                  >
                    <ArrowUp className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1"
                    disabled={isPending || i === statuses.length - 1}
                    onClick={() => handleMove(s.id, "down")}
                  >
                    <ArrowDown className="size-3" />
                  </Button>
                </div>
              </TableCell>
              <TableCell>
                <Input
                  defaultValue={s.name}
                  className="h-8 max-w-56"
                  disabled={isPending}
                  onBlur={(e) => {
                    if (e.target.value.trim() !== s.name) handleRename(s.id, e.target.value);
                  }}
                />
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={s.isFinal}
                  disabled={isPending}
                  onCheckedChange={(checked) => handleToggleFinal(s.id, checked === true)}
                />
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => handleDelete(s.id)}
                >
                  <X className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell />
            <TableCell>
              <Input
                placeholder="Новый статус"
                className="h-8 max-w-56"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
            </TableCell>
            <TableCell>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
              >
                {COLORS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </TableCell>
            <TableCell className="text-right">
              <Button type="button" size="sm" disabled={isPending || !newName.trim()} onClick={handleCreate}>
                Добавить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
