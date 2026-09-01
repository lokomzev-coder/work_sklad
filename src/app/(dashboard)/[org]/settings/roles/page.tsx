import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { deleteCustomRole } from "@/actions/custom-roles";

export default async function RolesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "customRoles", "view")) notFound();
  const canEdit = can(ctx, "customRoles", "edit");
  const canCreate = can(ctx, "customRoles", "create");
  const canDelete = can(ctx, "customRoles", "delete");

  const roles = await prisma.customRole.findMany({
    where: { orgId: ctx.orgId, isIndividual: false },
    orderBy: { name: "asc" },
    include: { _count: { select: { memberships: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="roles" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Роли доступа</h1>
          <p className="text-sm text-muted-foreground">
            Полная матрица прав по каждому разделу — просмотр/создание/редактирование/удаление,
            с видимостью «свои»/«свои и отдела»/«все» там, где это применимо. Назначьте роль
            сотруднику на карточке сотрудника, в разделе «Доступ в систему».
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`/${org}/settings/roles/new`} />}>Добавить роль</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Сотрудников</TableHead>
              {(canEdit || canDelete) && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Ролей пока нет
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {canEdit ? (
                      <Link href={`/${org}/settings/roles/${role.id}`} className="hover:underline">
                        {role.name}
                      </Link>
                    ) : (
                      role.name
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{role._count.memberships}</TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="text-right">
                      {canDelete && role._count.memberships === 0 && (
                        <SimpleDeleteButton
                          onDelete={deleteCustomRole.bind(null, org, role.id)}
                          title="Удалить роль?"
                          description="Роль будет удалена без возможности восстановления."
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
