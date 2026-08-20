import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateEmployee } from "@/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const employee = await prisma.employee.findFirst({
    where: { id, orgId: ctx.orgId },
  });

  if (!employee) {
    notFound();
  }

  const boundAction = updateEmployee.bind(null, org, employee.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{employee.fullName}</h1>
      <EmployeeForm
        orgSlug={org}
        action={boundAction}
        defaultValues={employee}
        submitLabel="Сохранить"
      />
    </div>
  );
}
