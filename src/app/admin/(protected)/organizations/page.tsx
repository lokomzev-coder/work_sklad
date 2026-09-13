import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { QuerySearchInput } from "@/components/forms/query-search-input";

export default async function PlatformOrganizationsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();
  assertPlatformPermission(ctx, "viewOrganizations");
  const { q } = await searchParams;

  const organizations = await prisma.organization.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    include: { subscriptionPlan: true, _count: { select: { memberships: true } } },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Организации</h1>
      <QuerySearchInput basePath={`${base}/organizations`} paramName="q" value={q ?? ""} placeholder="Поиск по названию или slug" />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Тариф</TableHead>
              <TableHead>Участников</TableHead>
              <TableHead>Создана</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Организации не найдены
                </TableCell>
              </TableRow>
            ) : (
              organizations.map((org) => (
                <TableRow key={org.id}>
                  <TableCell>
                    <Link href={`${base}/organizations/${org.id}`} className="underline">
                      {org.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{org.slug}</TableCell>
                  <TableCell>
                    {org.subscriptionPlan ? (
                      <Badge variant="default">{org.subscriptionPlan.name}</Badge>
                    ) : (
                      <Badge variant="secondary">Без тарифа</Badge>
                    )}
                  </TableCell>
                  <TableCell>{org._count.memberships}</TableCell>
                  <TableCell className="text-muted-foreground">{org.createdAt.toLocaleDateString("ru-RU")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
