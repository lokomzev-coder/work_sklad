import { getOrgContext } from "@/lib/tenant";
import { getStockBalances, getBundleStockBalances } from "@/lib/stock";
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

  const [rows, bundleRows] = await Promise.all([
    getStockBalances(ctx.orgId),
    getBundleStockBalances(ctx.orgId),
  ]);

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

      {bundleRows.length > 0 && (
        <>
          <h2 className="text-lg font-medium">Комплекты (доступно к сборке)</h2>
          <p className="text-sm text-muted-foreground">
            Не отдельный складской леджер — считается на лету из остатков компонентов
            (сколько комплектов можно собрать прямо сейчас).
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Склад</TableHead>
                  <TableHead>Комплект</TableHead>
                  <TableHead className="text-right">Можно собрать</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bundleRows.map((row) => (
                  <TableRow key={`${row.storeId}-${row.catalogItemId}`}>
                    <TableCell>{row.storeName}</TableCell>
                    <TableCell>{row.catalogItemName}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
