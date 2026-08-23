"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
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
import { createCustomRole, deleteCustomRole } from "@/actions/custom-roles";

interface RoleRow {
  id: string;
  name: string;
  ordersScope: "ALL" | "OWN";
  membershipCount: number;
}

export function CustomRolesManager({ orgSlug, roles }: { orgSlug: string; roles: RoleRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [ordersScope, setOrdersScope] = useState<"ALL" | "OWN">("OWN");

  function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    formData.set("ordersScope", ordersScope);
    startTransition(async () => {
      const result = await createCustomRole(orgSlug, {}, formData);
      if (result.error) {
        toast.error(result.error);
      } else {
        setName("");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCustomRole(orgSlug, id);
      toast.success("Роль удалена");
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Видимость заказов</TableHead>
            <TableHead>Сотрудников</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">{role.name}</TableCell>
              <TableCell>{role.ordersScope === "OWN" ? "Только свои" : "Все"}</TableCell>
              <TableCell className="text-muted-foreground">{role.membershipCount}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleDelete(role.id)}>
                  <X className="size-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell>
              <Input
                placeholder="Название роли"
                className="h-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </TableCell>
            <TableCell>
              <select
                className="h-8 rounded-md border bg-background px-2 text-sm"
                value={ordersScope}
                onChange={(e) => setOrdersScope(e.target.value as "ALL" | "OWN")}
              >
                <option value="OWN">Только свои</option>
                <option value="ALL">Все</option>
              </select>
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
