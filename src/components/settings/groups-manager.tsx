"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createGroup, archiveGroup, restoreGroup } from "@/actions/groups";

interface GroupRow {
  id: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
  employeeCount: number;
}

export function GroupsManager({ orgSlug, groups }: { orgSlug: string; groups: GroupRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    startTransition(async () => {
      const result = await createGroup(orgSlug, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setName("");
      }
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      await archiveGroup(orgSlug, id);
      toast.success("Отдел архивирован");
    });
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      await restoreGroup(orgSlug, id);
      toast.success("Отдел восстановлен");
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Сотрудников</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((group) => (
            <TableRow key={group.id} className={group.status === "ARCHIVED" ? "opacity-60" : undefined}>
              <TableCell className="font-medium">{group.name}</TableCell>
              <TableCell className="text-muted-foreground">{group.employeeCount}</TableCell>
              <TableCell className="text-right">
                {group.status === "ACTIVE" ? (
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleArchive(group.id)}>
                    <X className="size-4" />
                  </Button>
                ) : (
                  <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleRestore(group.id)}>
                    <RotateCcw className="size-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              <Input
                placeholder="Название отдела"
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </TableCell>
            <TableCell />
            <TableCell className="text-right">
              <Button type="button" size="sm" disabled={isPending || !name.trim()} onClick={handleCreate}>
                Добавить
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
