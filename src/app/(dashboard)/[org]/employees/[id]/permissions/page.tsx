import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can, resolveCapabilities, parseCustomRolePermissions } from "@/lib/permissions";
import { updateCustomRolePermissions } from "@/actions/custom-roles";
import { PermissionsMatrixEditor } from "@/components/settings/permissions-matrix-editor";

/**
 * Block I2.1 — the matrix editor for one employee's "Индивидуальные
 * настройки" (a hidden, single-membership CustomRole created by
 * switchToIndividualRole). Reuses the exact same editor and save action as
 * the named-role editor at /settings/roles/[id] — a CustomRole is a
 * CustomRole regardless of isIndividual, only the UI entry point differs.
 */
export default async function EmployeePermissionsPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "membership", "edit")) notFound();

  const membership = await prisma.membership.findFirst({
    where: { employeeId: id, orgId: ctx.orgId },
    include: { customRole: true, employee: { select: { fullName: true } } },
  });
  if (!membership?.customRole?.isIndividual) notFound();

  const override = parseCustomRolePermissions(membership.customRole.permissions);
  const initial = resolveCapabilities(ctx.role, override);
  const boundSave = updateCustomRolePermissions.bind(null, org, membership.customRole.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${org}/employees/${id}`} className="text-sm text-muted-foreground hover:underline">
          ← {membership.employee?.fullName ?? "Сотрудник"}
        </Link>
        <h1 className="text-2xl font-semibold">Индивидуальные права</h1>
        <p className="text-sm text-muted-foreground">
          Действуют только для этого сотрудника — не сохраняются как переиспользуемая роль.
        </p>
      </div>
      <PermissionsMatrixEditor initial={initial} ceiling={ctx.capabilities} onSave={boundSave} />
    </div>
  );
}
