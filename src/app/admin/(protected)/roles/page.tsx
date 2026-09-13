import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  getPlatformAdminContext,
  assertPlatformPermission,
  PLATFORM_CAPABILITIES,
  getAdminBasePath,
} from "@/lib/platform-auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { CreatePlatformRoleInline } from "@/components/admin/create-platform-role-inline";

export default async function PlatformRolesPage() {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();
  assertPlatformPermission(ctx, "manageAdmins");

  const roles = await prisma.platformRole.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { admins: true } } },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Роли платформенных администраторов</h1>
        <CreatePlatformRoleInline capabilities={[...PLATFORM_CAPABILITIES]} />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Администраторов</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {roles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Ролей пока нет — по умолчанию доступ есть только у головного аккаунта
                </TableCell>
              </TableRow>
            ) : (
              roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <Link href={`${base}/roles/${role.id}`} className="underline">
                      {role.name}
                    </Link>
                  </TableCell>
                  <TableCell>{role._count.admins}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
