import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can, resolveCapabilities, parseCustomRolePermissions } from "@/lib/permissions";
import { updateCustomRolePermissions } from "@/actions/custom-roles";
import { PermissionsMatrixEditor } from "@/components/settings/permissions-matrix-editor";
import { RenameRoleForm } from "@/components/settings/rename-role-form";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "customRoles", "edit")) notFound();

  const role = await prisma.customRole.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!role) notFound();

  // Seeded with the ACTOR's own base Role as a sensible full default for
  // every resource, then the role's own saved overrides layered on top —
  // not the base Role of whoever this CustomRole ends up assigned to (a
  // named role isn't tied to one base Role, so there's no single "effective"
  // default to show otherwise). Saving always writes a fully-specified
  // 22-resource map, so this substrate choice only affects what a brand-new
  // or partially-configured role's unset rows look like when opened.
  const override = parseCustomRolePermissions(role.permissions);
  const initial = resolveCapabilities(ctx.role, override);
  const boundSave = updateCustomRolePermissions.bind(null, org, id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">{role.name}</h1>
        <p className="text-sm text-muted-foreground">
          Права ниже — полная матрица для этой роли. Строки «Доступ в систему (логины)» и «Роли
          доступа» всегда берутся из базовой роли назначенного сотрудника — их нельзя расширить
          через пользовательскую роль.
        </p>
      </div>
      <RenameRoleForm orgSlug={org} roleId={role.id} currentName={role.name} />
      <PermissionsMatrixEditor initial={initial} ceiling={ctx.capabilities} onSave={boundSave} />
    </div>
  );
}
