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
import { ProductionSubnav } from "@/components/production/production-subnav";

export default async function TechCardsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "techCards", "view")) notFound();

  const techCards = await prisma.techCard.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    include: { outputItem: true, _count: { select: { components: true } } },
    orderBy: { name: "asc" },
  });

  const canEdit = can(ctx, "techCards", "edit");

  return (
    <div className="flex flex-col gap-4">
      <ProductionSubnav org={org} active="tech-cards" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Технологические карты</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/production/tech-cards/new`} />}>Новая техкарта</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Выходной товар</TableHead>
              <TableHead className="text-right">Материалов</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {techCards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Техкарт пока нет
                </TableCell>
              </TableRow>
            ) : (
              techCards.map((tc) => (
                <TableRow key={tc.id}>
                  <TableCell>
                    <Link href={`/${org}/production/tech-cards/${tc.id}`} className="font-medium hover:underline">
                      {tc.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {tc.outputQuantity.toString()} × {tc.outputItem.name}
                  </TableCell>
                  <TableCell className="text-right">{tc._count.components}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
