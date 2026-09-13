import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { deletePriceType } from "@/actions/price-types";

export default async function PriceTypesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "priceTypes", "view")) notFound();
  const canCreate = can(ctx, "priceTypes", "create");
  const canDelete = can(ctx, "priceTypes", "delete");

  const priceTypes = await prisma.priceType.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="price-types" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Типы цен</h1>
          <p className="text-sm text-muted-foreground">
            Дополнительные прайс-листы для товаров (например, «Оптовая», «VIP») — задаются в
            карточке товара. Не влияют на цену в заказах/кассе автоматически — только справочно и
            через API.
          </p>
        </div>
        {canCreate && (
          <Button render={<Link href={`/${org}/settings/price-types/new`} />}>Добавить</Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>По умолчанию</TableHead>
              {canDelete && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {priceTypes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canDelete ? 3 : 2} className="text-center text-muted-foreground">
                  Типы цен ещё не добавлены
                </TableCell>
              </TableRow>
            ) : (
              priceTypes.map((pt) => (
                <TableRow key={pt.id}>
                  <TableCell>{pt.name}</TableCell>
                  <TableCell>{pt.isDefault && <Badge variant="secondary">По умолчанию</Badge>}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deletePriceType.bind(null, org, pt.id)}
                        title="Удалить тип цены?"
                        description="Все цены товаров для этого типа тоже будут удалены."
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
