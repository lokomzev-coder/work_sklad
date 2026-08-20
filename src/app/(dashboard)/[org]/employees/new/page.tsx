import { createEmployee } from "@/actions/employees";
import { EmployeeForm } from "@/components/employees/employee-form";

export default async function NewEmployeePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const boundAction = createEmployee.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый сотрудник</h1>
      <EmployeeForm
        orgSlug={org}
        action={boundAction}
        submitLabel="Создать"
      />
    </div>
  );
}
