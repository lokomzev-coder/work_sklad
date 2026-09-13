import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { deleteDiscount } from "@/actions/discounts";
import { DiscountActiveToggle } from "@/components/settings/discount-active-toggle";

const TARGET_LABELS: Record<string, string> = {
  ALL: "Все товары",
  CATALOG_GROUP: "Группа товаров",
  CATALOG_ITEM: "Товар",
  CLIENT: "Клиент",
};

export default async function DiscountsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "discounts", "view")) notFound();
  const canCreate = can(ctx, "discounts", "create");
  const canEdit = can(ctx, "discounts", "edit");
  const canDelete = can(ctx, "discounts", "delete");

  const discounts = await prisma.discount.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });

  const groupIds = discounts.filter((d) => d.target === "CATALOG_GROUP" && d.targetId).map((d) => d.targetId!);
  const itemIds = discounts.filter((d) => d.target === "CATALOG_ITEM" && d.targetId).map((d) => d.targetId!);
  const clientIds = discounts.filter((d) => d.target === "CLIENT" && d.targetId).map((d) => d.targetId!);

  const [groups, items, clients] = await Promise.all([
    groupIds.length ? prisma.catalogGroup.findMany({ where: { id: { in: groupIds } } }) : [],
    itemIds.length ? prisma.catalogItem.findMany({ where: { id: { in: itemIds } } }) : [],
    clientIds.length ? prisma.client.findMany({ where: { id: { in: clientIds } } }) : [],
  ]);
  const nameById = new Map<string, string>([
    ...groups.map((g) => [g.id, g.name] as const),
    ...items.map((i) => [i.id, i.name] as const),
    ...clients.map((c) => [c.id, c.name] as const),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="discounts" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Скидки</h1>
          <p className="text-sm text-muted-foreground">
            Правила скидок — на всё, на группу/товар или на конкретного клиента, с датами действия.
            Пока не применяются автоматически при оформлении заказа/продажи — только справочно и
            через API.
          </p>
        </div>
        {canCreate && <Button render={<Link href={`/${org}/settings/discounts/new`} />}>Добавить</Button>}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Размер</TableHead>
              <TableHead>Действует на</TableHead>
              <TableHead>Период</TableHead>
              <TableHead>Активна</TableHead>
              {canDelete && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {discounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  Скидки ещё не добавлены
                </TableCell>
              </TableRow>
            ) : (
              discounts.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>{d.name}</TableCell>
                  <TableCell>{d.type === "PERCENTAGE" ? "Процент" : "Сумма"}</TableCell>
                  <TableCell>{d.type === "PERCENTAGE" ? `${d.value}%` : d.value.toString()}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {TARGET_LABELS[d.target]}
                      {d.targetId ? `: ${nameById.get(d.targetId) ?? "—"}` : ""}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {d.startDate || d.endDate
                      ? `${d.startDate ? d.startDate.toLocaleDateString("ru-RU") : "…"} – ${d.endDate ? d.endDate.toLocaleDateString("ru-RU") : "…"}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <DiscountActiveToggle orgSlug={org} discountId={d.id} isActive={d.isActive} />
                    ) : (
                      <Checkbox checked={d.isActive} disabled />
                    )}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <SimpleDeleteButton
                        onDelete={deleteDiscount.bind(null, org, d.id)}
                        title="Удалить скидку?"
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
