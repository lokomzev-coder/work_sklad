"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { setTaskStatus, deleteTask } from "@/actions/tasks";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  status: "OPEN" | "DONE";
  assignedEmployeeName: string | null;
  createdByName: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ru-RU");
}

function isOverdue(iso: string | null, status: "OPEN" | "DONE"): boolean {
  if (!iso || status === "DONE") return false;
  return new Date(iso) < new Date(new Date().toDateString());
}

export function TaskList({ orgSlug, tasks, canDelete }: { orgSlug: string; tasks: TaskRow[]; canDelete: boolean }) {
  const [isPending, startTransition] = useTransition();

  function toggle(taskId: string, done: boolean) {
    startTransition(async () => {
      const result = await setTaskStatus(orgSlug, taskId, done ? "DONE" : "OPEN");
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-0" />
            <TableHead>Название</TableHead>
            <TableHead>Исполнитель</TableHead>
            <TableHead>Срок</TableHead>
            <TableHead>Постановщик</TableHead>
            {canDelete && <TableHead className="w-0" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canDelete ? 6 : 5} className="text-center text-muted-foreground">
                Задач пока нет
              </TableCell>
            </TableRow>
          ) : (
            tasks.map((task) => (
              <TableRow key={task.id} className={task.status === "DONE" ? "opacity-60" : undefined}>
                <TableCell>
                  <Checkbox
                    checked={task.status === "DONE"}
                    disabled={isPending}
                    onCheckedChange={(checked) => toggle(task.id, checked === true)}
                  />
                </TableCell>
                <TableCell>
                  <div className={task.status === "DONE" ? "line-through" : undefined}>{task.title}</div>
                  {task.description && <div className="text-xs text-muted-foreground">{task.description}</div>}
                </TableCell>
                <TableCell>{task.assignedEmployeeName ?? "—"}</TableCell>
                <TableCell>
                  {formatDate(task.dueDate)}
                  {isOverdue(task.dueDate, task.status) && (
                    <Badge variant="destructive" className="ml-2">
                      Просрочено
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{task.createdByName}</TableCell>
                {canDelete && (
                  <TableCell className="text-right">
                    <SimpleDeleteButton onDelete={deleteTask.bind(null, orgSlug, task.id)} title="Удалить задачу?" />
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
