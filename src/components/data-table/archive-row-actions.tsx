"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { EntityStatusFilter } from "@/components/data-table/archivable-entity-table";
import type { ArchiveOrDeleteResult } from "@/lib/archive";

interface ArchiveRowActionsProps {
  status: EntityStatusFilter;
  onArchive: () => Promise<void>;
  onRestore: () => Promise<void>;
  onDelete: () => Promise<ArchiveOrDeleteResult>;
  deleteTitle: string;
  deleteDescription?: string;
}

export function ArchiveRowActions({
  status,
  onArchive,
  onRestore,
  onDelete,
  deleteTitle,
  deleteDescription = "Если запись уже где-то используется (например, в заказе), она будет автоматически перемещена в архив вместо удаления.",
}: ArchiveRowActionsProps) {
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    startTransition(async () => {
      await onArchive();
      toast.success("Перемещено в архив");
    });
  }

  function handleRestore() {
    startTransition(async () => {
      await onRestore();
      toast.success("Восстановлено из архива");
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await onDelete();
      if (result.archived) {
        toast.info(result.reason ?? "Запись перемещена в архив");
      } else {
        toast.success("Удалено");
      }
    });
  }

  return (
    <div className="flex justify-end gap-2">
      {status === "ACTIVE" ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={handleArchive}
        >
          В архив
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={handleRestore}
        >
          Восстановить
        </Button>
      )}
      <AlertDialog>
        <AlertDialogTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="text-destructive hover:text-destructive"
            >
              Удалить
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
