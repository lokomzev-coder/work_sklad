import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { ProjectForm } from "@/components/projects/project-form";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [clients, employees] = await Promise.all([
    prisma.client.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.employee.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { fullName: "asc" } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый проект</h1>
      <ProjectForm
        orgSlug={org}
        projectId={null}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
        employeeOptions={employees.map((e) => ({ value: e.id, label: e.fullName }))}
      />
    </div>
  );
}
