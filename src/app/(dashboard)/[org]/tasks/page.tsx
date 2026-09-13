import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { buildScopeWhere } from "@/lib/scope";
import { Button } from "@/components/ui/button";
import { TaskList, type TaskRow } from "@/components/tasks/task-list";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "tasks", "view")) notFound();
  const canCreate = can(ctx, "tasks", "create");
  const canDelete = can(ctx, "tasks", "delete");

  const scopeWhere = await buildScopeWhere(ctx, "tasks");
  const tasks = await prisma.task.findMany({
    where: { orgId: ctx.orgId, ...scopeWhere },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      assignedEmployee: { select: { fullName: true } },
      createdBy: { select: { fullName: true } },
    },
  });

  const rows: TaskRow[] = tasks.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    status: task.status,
    assignedEmployeeName: task.assignedEmployee?.fullName ?? null,
    createdByName: task.createdBy.fullName,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Задачи</h1>
          <p className="text-sm text-muted-foreground">Ручные напоминания сотрудникам — сделать X к дате Y.</p>
        </div>
        {canCreate && <Button render={<Link href={`/${org}/tasks/new`} />}>Новая задача</Button>}
      </div>
      <TaskList orgSlug={org} tasks={rows} canDelete={canDelete} />
    </div>
  );
}
