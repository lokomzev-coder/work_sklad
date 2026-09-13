import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission } from "@/lib/platform-auth";
import { Card, CardContent } from "@/components/ui/card";
import { FeatureCatalogItemForm } from "@/components/admin/feature-catalog-item-form";
import { ArchiveFeatureCatalogItemButton } from "@/components/admin/archive-feature-catalog-item-button";

export default async function FeatureCatalogItemEditPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageSubscriptions");
  const { id } = await params;

  const item = await prisma.subscriptionFeatureCatalogItem.findUnique({ where: { id } });
  if (!item) {
    notFound();
  }

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{item.label}</h1>
        <ArchiveFeatureCatalogItemButton id={item.id} status={item.status} />
      </div>
      <Card>
        <CardContent className="pt-6">
          <FeatureCatalogItemForm
            item={{
              id: item.id,
              key: item.key,
              label: item.label,
              description: item.description,
              kind: item.kind,
              unitPrice: item.unitPrice.toString(),
              includedInAllPlans: item.includedInAllPlans,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
