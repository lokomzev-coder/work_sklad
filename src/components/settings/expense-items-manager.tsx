"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { createExpenseItem, deleteExpenseItem } from "@/actions/expense-items";

export function ExpenseItemsManager({
  orgSlug,
  items,
  canCreate,
  canDelete,
}: {
  orgSlug: string;
  items: { id: string; name: string }[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");

  function handleCreate() {
    if (!name.trim()) return;
    startTransition(async () => {
      const result = await createExpenseItem(orgSlug, name.trim());
      if (result.error) toast.error(result.error);
      else setName("");
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            {canDelete && <TableHead className="w-0" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 && !canCreate ? (
            <TableRow>
              <TableCell colSpan={canDelete ? 2 : 1} className="text-center text-muted-foreground">
                Статьи расходов ещё не добавлены
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                {canDelete && (
                  <TableCell className="text-right">
                    <SimpleDeleteButton
                      onDelete={deleteExpenseItem.bind(null, orgSlug, item.id)}
                      title="Удалить статью расходов?"
                    />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
          {canCreate && (
            <TableRow>
              <TableCell>
                <Input
                  placeholder="Название статьи (например, «Аренда»)"
                  className="h-8"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </TableCell>
              <TableCell className="text-right">
                <Button type="button" size="sm" disabled={isPending || !name.trim()} onClick={handleCreate}>
                  Добавить
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
