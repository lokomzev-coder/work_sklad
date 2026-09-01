import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { createEmployee } from "@/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { NewEmployeeAccessFields } from "@/components/employees/new-employee-access-fields";

export default async function NewEmployeePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "employees", "create")) notFound();
  const boundAction = createEmployee.bind(null, org);
  const canGrantAccess = can(ctx, "membership", "create");

  const [stores, groups, customRoles] = await Promise.all([
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.group.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    canGrantAccess
      ? prisma.customRole.findMany({ where: { orgId: ctx.orgId, isIndividual: false }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый сотрудник</h1>
      <EmployeeForm
        orgSlug={org}
        action={boundAction}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        groupOptions={groups.map((g) => ({ value: g.id, label: g.name }))}
        submitLabel="Создать"
      >
        {canGrantAccess && (
          <NewEmployeeAccessFields
            orgSlug={org}
            customRoleOptions={customRoles.map((r) => ({ id: r.id, name: r.name }))}
          />
        )}
      </EmployeeForm>
    </div>
  );
}
