import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createTask } from "@/actions/tasks";
import { TaskForm } from "@/components/tasks/task-form";

export default async function NewTaskPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "tasks", "create")) notFound();

  const employees = await prisma.employee.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true },
  });

  const boundAction = createTask.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая задача</h1>
      <TaskForm orgSlug={org} employees={employees} action={boundAction} />
    </div>
  );
}
