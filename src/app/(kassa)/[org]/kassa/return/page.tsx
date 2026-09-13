import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { ReturnForm } from "@/components/kassa/return-form";

export default async function KassaReturnPage({
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
    return <p className="mx-auto max-w-sm text-center text-sm text-muted-foreground">Смена не открыта.</p>;
  }

  const [catalogItems, clients] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", type: "PRODUCT" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, barcode: true, unitPrice: true, currency: true },
    }),
    prisma.client.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", isWalkIn: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <ReturnForm
      orgSlug={org}
      catalogOptions={catalogItems.map((c) => ({
        id: c.id,
        name: c.name,
        barcode: c.barcode,
        unitPrice: c.unitPrice.toString(),
        currency: c.currency,
      }))}
      clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}
