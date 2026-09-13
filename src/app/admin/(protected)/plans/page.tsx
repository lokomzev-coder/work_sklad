import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { CreateSubscriptionPlanInline } from "@/components/admin/create-subscription-plan-inline";

export default async function SubscriptionPlansPage() {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();
  assertPlatformPermission(ctx, "manageSubscriptions");

  // Блок Q — private per-org plans materialized by the "Свой тариф"
  // constructor are hidden here; they're not a shared, reusable catalog
  // entry, just internal bookkeeping for one organization's custom
  // selection (visible on that org's own detail page instead).
  const [plans, catalogItems] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isCustom: false },
      orderBy: { priceMonthly: "asc" },
      include: { _count: { select: { organizations: true } } },
    }),
    prisma.subscriptionFeatureCatalogItem.findMany({
      where: { status: "ACTIVE", kind: "FEATURE" },
      orderBy: { label: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Тарифы</h1>
        <CreateSubscriptionPlanInline
          featureOptions={catalogItems.map((c) => ({
            key: c.key,
            label: c.label,
            includedInAllPlans: c.includedInAllPlans,
          }))}
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Лимит сотрудников</TableHead>
              <TableHead>Лимит заказов/мес</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead>Организаций</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Тарифов пока нет
                </TableCell>
              </TableRow>
            ) : (
              plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <Link href={`${base}/plans/${plan.id}`} className="underline">
                      {plan.name}
                    </Link>
                  </TableCell>
                  <TableCell>{plan.maxEmployees ?? "Без лимита"}</TableCell>
                  <TableCell>{plan.maxOrdersPerMonth ?? "Без лимита"}</TableCell>
                  <TableCell className="text-right">{formatMoney(Number(plan.priceMonthly), plan.currency)}</TableCell>
                  <TableCell>{plan._count.organizations}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
