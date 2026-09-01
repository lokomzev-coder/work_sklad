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

export default async function TechProcessesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "techProcesses", "view")) notFound();

  const techProcesses = await prisma.techProcess.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    include: { positions: { include: { processingStage: true }, orderBy: { position: "asc" } } },
    orderBy: { name: "asc" },
  });

  const canEdit = can(ctx, "techProcesses", "edit");

  return (
    <div className="flex flex-col gap-4">
      <ProductionSubnav org={org} active="tech-processes" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Техпроцессы</h1>
        {canEdit && <Button render={<Link href={`/${org}/production/tech-processes/new`} />}>Новый техпроцесс</Button>}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Этапы</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {techProcesses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  Техпроцессов пока нет
                </TableCell>
              </TableRow>
            ) : (
              techProcesses.map((tp) => (
                <TableRow key={tp.id}>
                  <TableCell>
                    <Link href={`/${org}/production/tech-processes/${tp.id}`} className="font-medium hover:underline">
                      {tp.name}
                    </Link>
                  </TableCell>
                  <TableCell>{tp.positions.map((p) => p.processingStage.name).join(" → ")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
