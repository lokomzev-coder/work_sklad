import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { updateEmployee } from "@/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";
import { EmployeeAccessSection } from "@/components/employees/employee-access-section";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "employees", "view")) notFound();

  const [employee, stores, groups] = await Promise.all([
    prisma.employee.findFirst({ where: { id, orgId: ctx.orgId } }),
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.group.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
  ]);

  if (!employee) {
    notFound();
  }

  const boundAction = updateEmployee.bind(null, org, employee.id);
  const canManageMembership = can(ctx, "membership", "edit");

  let membership: {
    login: string;
    role: import("@/generated/prisma/enums").Role;
    customRoleId: string | null;
    isIndividualRole: boolean;
  } | null = null;
  let customRoleOptions: { id: string; name: string }[] = [];
  if (canManageMembership) {
    const [membershipRow, roles] = await Promise.all([
      prisma.membership.findFirst({
        where: { employeeId: employee.id, orgId: ctx.orgId },
        select: { login: true, role: true, customRoleId: true, customRole: { select: { isIndividual: true } } },
      }),
      prisma.customRole.findMany({ where: { orgId: ctx.orgId, isIndividual: false }, orderBy: { name: "asc" } }),
    ]);
    membership = membershipRow
      ? {
          login: membershipRow.login,
          role: membershipRow.role,
          customRoleId: membershipRow.customRoleId,
          isIndividualRole: membershipRow.customRole?.isIndividual ?? false,
        }
      : null;
    customRoleOptions = roles.map((r) => ({ id: r.id, name: r.name }));
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{employee.fullName}</h1>
      <EmployeeForm
        orgSlug={org}
        action={boundAction}
        storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
        groupOptions={groups.map((g) => ({ value: g.id, label: g.name }))}
        defaultValues={employee}
        submitLabel="Сохранить"
      />
      {canManageMembership && (
        <EmployeeAccessSection
          orgSlug={org}
          orgSlugForLogin={org}
          employeeId={employee.id}
          membership={membership}
          customRoleOptions={customRoleOptions}
        />
      )}
    </div>
  );
}
