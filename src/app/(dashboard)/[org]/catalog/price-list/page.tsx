import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { CatalogSubnav } from "@/components/catalog/catalog-subnav";
import { PrintPriceListButton } from "@/components/catalog/print-price-list-button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";

export default async function PriceListPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalog", "view")) notFound();

  const [priceTypes, items] = await Promise.all([
    prisma.priceType.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" } }),
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      include: { prices: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <CatalogSubnav org={org} active="price-list" />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Прайс-лист</h1>
          <p className="text-sm text-muted-foreground print:hidden">
            Базовая цена и все настроенные типы цен (Настройки → Типы цен) по каждому товару —
            удобно распечатать или сохранить в PDF для рассылки контрагентам.
          </p>
        </div>
        <PrintPriceListButton />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead className="text-right">Базовая цена</TableHead>
              {priceTypes.map((pt) => (
                <TableHead key={pt.id} className="text-right">
                  {pt.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2 + priceTypes.length} className="text-center text-muted-foreground">
                  Товаров пока нет
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const pricesByType = new Map(item.prices.map((p) => [p.priceTypeId, p]));
                return (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell className="text-right">{formatMoney(Number(item.unitPrice), item.currency)}</TableCell>
                    {priceTypes.map((pt) => {
                      const price = pricesByType.get(pt.id);
                      return (
                        <TableCell key={pt.id} className="text-right">
                          {price ? formatMoney(Number(price.value), price.currency) : "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
