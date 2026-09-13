import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";
import { Card, CardContent } from "@/components/ui/card";
import { SubscriptionPlanForm } from "@/components/admin/subscription-plan-form";
import { DeleteSubscriptionPlanButton } from "@/components/admin/delete-subscription-plan-button";

export default async function SubscriptionPlanEditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");
  const { id } = await params;

  const [plan, catalogItems] = await Promise.all([
    prisma.subscriptionPlan.findUnique({ where: { id } }),
    prisma.subscriptionFeatureCatalogItem.findMany({
      where: { status: "ACTIVE", kind: "FEATURE" },
      orderBy: { label: "asc" },
    }),
  ]);
  if (!plan) {
    notFound();
  }

  const planFeatures =
    plan.features && typeof plan.features === "object" && !Array.isArray(plan.features)
      ? (plan.features as Record<string, boolean>)
      : {};

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Тариф: {plan.name}</h1>
        <DeleteSubscriptionPlanButton id={plan.id} adminBasePath={getAdminBasePath()} />
      </div>
      <Card>
        <CardContent className="pt-6">
          <SubscriptionPlanForm
            plan={{
              id: plan.id,
              name: plan.name,
              maxEmployees: plan.maxEmployees,
              maxOrdersPerMonth: plan.maxOrdersPerMonth,
              priceMonthly: plan.priceMonthly.toString(),
              currency: plan.currency,
              features: planFeatures,
            }}
            featureOptions={catalogItems.map((c) => ({
              key: c.key,
              label: c.label,
              includedInAllPlans: c.includedInAllPlans,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
