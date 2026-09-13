import { getOrgContext } from "@/lib/tenant";
import { getStockBalances, getBundleStockBalances, getAllReservedQuantities } from "@/lib/stock";
import { getStockShortfallReport, getExpiringBatchesReport } from "@/lib/reports";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { WarehouseSubnav } from "@/components/warehouse/warehouse-subnav";

export default async function StockReportPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [rows, bundleRows, reservedByKey, shortfallRows, expiringBatches] = await Promise.all([
    getStockBalances(ctx.orgId, { byVariant: true }),
    getBundleStockBalances(ctx.orgId),
    getAllReservedQuantities(ctx.orgId),
    getStockShortfallReport(ctx.orgId),
    getExpiringBatchesReport(ctx.orgId),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <WarehouseSubnav org={org} active="stock" />
      <h1 className="text-2xl font-semibold">Остатки</h1>

      {shortfallRows.length > 0 && (
        <>
          <h2 className="text-lg font-medium text-destructive">Дефицит (ниже минимального остатка)</h2>
          <p className="text-sm text-muted-foreground">
            Минимальный остаток задаётся в карточке товара (поле «Мин. остаток»), считается по
            сумме остатков на всех складах. Товары без заданного минимума сюда не попадают.
          </p>
          <div className="rounded-md border border-destructive/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead className="text-right">Остаток</TableHead>
                  <TableHead className="text-right">Мин. остаток</TableHead>
                  <TableHead className="text-right">Не хватает</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shortfallRows.map((row) => (
                  <TableRow key={row.catalogItemId}>
                    <TableCell>{row.catalogItemName}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                    <TableCell className="text-right">{row.minStock}</TableCell>
                    <TableCell className="text-right text-destructive">{row.shortfall}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {expiringBatches.length > 0 && (
        <>
          <h2 className="text-lg font-medium">Партии со сроком годности</h2>
          <p className="text-sm text-muted-foreground">
            Только партии, для которых срок годности указан при приёмке (поля «Партия»/срок в
            форме «Принять»). Остальные партии не отслеживаются здесь — сознательное упрощение.
          </p>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Товар</TableHead>
                  <TableHead>Модификация</TableHead>
                  <TableHead>Партия</TableHead>
                  <TableHead>Срок годности</TableHead>
                  <TableHead className="text-right">Остаток</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringBatches.map((b) => (
                  <TableRow key={b.batchId}>
                    <TableCell>{b.catalogItemName}</TableCell>
                    <TableCell>{b.variantLabel ?? "—"}</TableCell>
                    <TableCell>{b.label ?? "—"}</TableCell>
                    <TableCell>
                      {new Date(b.expiryDate).toLocaleDateString("ru-RU")}
                      {b.isExpired && (
                        <Badge variant="destructive" className="ml-2">
                          Просрочено
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{b.remainingQuantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Склад</TableHead>
              <TableHead>Товар</TableHead>
              <TableHead>Модификация</TableHead>
              <TableHead className="text-right">Количество</TableHead>
              <TableHead className="text-right">Резерв</TableHead>
              <TableHead className="text-right">Доступно</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Остатков пока нет — проведите первое движение (оприходование)
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const reserved = reservedByKey.get(`${row.storeId}:${row.catalogItemId}:${row.variantId ?? ""}`) ?? 0;
                const available = Math.max(0, Number(row.quantity) - reserved);
                return (
                  <TableRow key={`${row.storeId}-${row.catalogItemId}-${row.variantId ?? ""}`}>
                    <TableCell>{row.storeName}</TableCell>
                    <TableCell>{row.catalogItemName}</TableCell>
                    <TableCell>{row.variantLabel ?? "—"}</TableCell>
                    <TableCell className="text-right">{row.quantity}</TableCell>
                    <TableCell className="text-right">{reserved > 0 ? reserved : "—"}</TableCell>
                    <TableCell className="text-right">{available}</TableCell>
                  </TableRow>
                );
              })
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
