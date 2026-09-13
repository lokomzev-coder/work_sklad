import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { ProjectForm } from "@/components/projects/project-form";

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "projects", "view")) notFound();

  const project = await prisma.project.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!project) notFound();

  const referencedClient = project.clientId
    ? await prisma.client.findUnique({ where: { id: project.clientId } })
    : null;
  const referencedEmployee = project.responsibleEmployeeId
    ? await prisma.employee.findUnique({ where: { id: project.responsibleEmployeeId } })
    : null;

  const [activeClients, activeEmployees] = await Promise.all([
    prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
  ]);

  const clients = referencedClient
    ? [referencedClient, ...activeClients.filter((c) => c.id !== referencedClient.id)]
    : activeClients;
  const employees = referencedEmployee
    ? [referencedEmployee, ...activeEmployees.filter((e) => e.id !== referencedEmployee.id)]
    : activeEmployees;

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <ProjectForm
        orgSlug={org}
        projectId={project.id}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
        employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
        defaultValues={{
          name: project.name,
          clientId: project.clientId,
          responsibleEmployeeId: project.responsibleEmployeeId,
          startDate: project.startDate ? project.startDate.toISOString().slice(0, 10) : null,
          endDate: project.endDate ? project.endDate.toISOString().slice(0, 10) : null,
          budget: project.budget ? project.budget.toString() : null,
        }}
      />
    </div>
  );
}
