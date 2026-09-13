import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { OpenShiftForm } from "@/components/kassa/open-shift-form";
import { PosScreen } from "@/components/kassa/pos-screen";

export default async function KassaPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  if (!ctx.defaultStoreId) {
    return (
      <p className="mx-auto max-w-sm text-center text-sm text-muted-foreground">
        Обратитесь к администратору: не назначена точка продаж.
      </p>
    );
  }

  const shift = await prisma.retailShift.findFirst({
    where: { orgId: ctx.orgId, storeId: ctx.defaultStoreId, status: "OPEN" },
  });

  if (!shift) {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: ctx.defaultStoreId },
      select: { name: true },
    });
    return <OpenShiftForm orgSlug={org} storeName={store.name} />;
  }

  const [catalogItems, clients] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", type: "PRODUCT" },
      orderBy: { name: "asc" },
      include: {
        variants: {
          where: { status: "ACTIVE" },
          include: { values: { include: { characteristic: true } } },
        },
      },
    }),
    prisma.client.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", isWalkIn: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const catalogOptions = catalogItems.map((item) => ({
    id: item.id,
    name: item.name,
    barcode: item.barcode,
    unitPrice: item.unitPrice.toString(),
    currency: item.currency,
    variants: item.variants.map((v) => ({
      id: v.id,
      label: v.values.map((val) => `${val.characteristic.name}: ${val.value}`).join(", ") || "Модификация",
      price: v.priceOverride ? v.priceOverride.toString() : null,
      barcode: v.barcode,
    })),
  }));

  return (
    <PosScreen
      orgSlug={org}
      catalogOptions={catalogOptions}
      clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}
