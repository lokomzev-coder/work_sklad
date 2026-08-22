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
import { OrdersSubnav } from "@/components/orders/orders-subnav";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { deleteSalesChannel } from "@/actions/sales-channels";

export default async function SalesChannelsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const canEdit = can(ctx.role, "orders", "edit");

  const channels = await prisma.salesChannel.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <OrdersSubnav org={org} active="channels" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Каналы продаж</h1>
        {canEdit && (
          <Button render={<Link href={`/${org}/orders/channels/new`} />}>
            Добавить
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              {canEdit && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 2 : 1} className="text-center text-muted-foreground">
                  Каналы продаж ещё не добавлены
                </TableCell>
              </TableRow>
            ) : (
              channels.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  {canEdit && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deleteSalesChannel.bind(null, org, c.id)}
                        title="Удалить канал продаж?"
                        description="Если канал используется в заказах, удаление будет заблокировано."
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
