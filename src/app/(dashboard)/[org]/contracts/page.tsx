import Link from "next/link";
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
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { deleteContract } from "@/actions/contracts";

export default async function ContractsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const canEdit = can(ctx.role, "orders", "edit");

  const contracts = await prisma.contract.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { client: true },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Договоры</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/contracts/new`} />}>Новый договор</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Номер</TableHead>
              <TableHead>Контрагент</TableHead>
              <TableHead>Дата подписания</TableHead>
              {canEdit && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 4 : 3} className="text-center text-muted-foreground">
                  Договоров пока нет
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.number}</TableCell>
                  <TableCell>{c.client.name}</TableCell>
                  <TableCell>{c.signedAt ? c.signedAt.toLocaleDateString("ru-RU") : "—"}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deleteContract.bind(null, org, c.id)}
                        title="Удалить договор?"
                        description="Если договор привязан к заказам, удаление будет заблокировано."
                      />
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
