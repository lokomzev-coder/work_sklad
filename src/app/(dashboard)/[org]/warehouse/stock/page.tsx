import { getOrgContext } from "@/lib/tenant";
import { getStockBalances } from "@/lib/stock";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { WarehouseSubnav } from "@/components/warehouse/warehouse-subnav";

export default async function StockReportPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const rows = await getStockBalances(ctx.orgId);

  return (
    <div className="flex flex-col gap-4">
      <WarehouseSubnav org={org} active="stock" />
      <h1 className="text-2xl font-semibold">Остатки</h1>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Склад</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead className="text-right">Количество</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  Остатков пока нет — проведите первое движение (оприходование)
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={`${row.storeId}-${row.catalogItemId}`}>
                  <TableCell>{row.storeName}</TableCell>
                  <TableCell>{row.catalogItemName}</TableCell>
                  <TableCell className="text-right">{row.quantity}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
