import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { ExpenseItemsManager } from "@/components/settings/expense-items-manager";

export default async function ExpenseItemsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "expenseItems", "view")) notFound();
  const canCreate = can(ctx, "expenseItems", "create");
  const canDelete = can(ctx, "expenseItems", "delete");

  const items = await prisma.expenseItem.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="expense-items" />
      <div>
        <h1 className="text-2xl font-semibold">Статьи расходов</h1>
        <p className="text-sm text-muted-foreground">
          Категории для учёта расходов вне себестоимости товара (аренда, реклама, зарплата и т.п.).
          Пока это только справочник — привязка к конкретной расходной операции появится вместе с
          кассовыми ордерами (Блок O, фаза 6).
        </p>
      </div>
      <ExpenseItemsManager orgSlug={org} items={items} canCreate={canCreate} canDelete={canDelete} />
    </div>
  );
}
