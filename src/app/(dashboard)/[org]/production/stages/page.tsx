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

export default async function ProcessingStagesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "techProcesses", "view")) notFound();

  const stages = await prisma.processingStage.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  const canEdit = can(ctx, "techProcesses", "edit");

  return (
    <div className="flex flex-col gap-4">
      <ProductionSubnav org={org} active="stages" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Этапы производства</h1>
        {canEdit && <Button render={<Link href={`/${org}/production/stages/new`} />}>Новый этап</Button>}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead className="text-right">Стоимость часа</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Этапов пока нет
                </TableCell>
              </TableRow>
            ) : (
              stages.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/${org}/production/stages/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{s.standardHourCost?.toString() ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
