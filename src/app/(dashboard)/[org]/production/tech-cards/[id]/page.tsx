import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { TechCardForm } from "@/components/production/tech-card-form";

export default async function EditTechCardPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const [techCard, products] = await Promise.all([
    prisma.techCard.findFirst({
      where: { id, orgId: ctx.orgId },
      include: { components: true },
    }),
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", type: "PRODUCT" },
      orderBy: { name: "asc" },
    }),
  ]);
  if (!techCard) notFound();

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{techCard.name}</h1>
      <TechCardForm
        orgSlug={org}
        techCardId={techCard.id}
        productOptions={products.map((p) => ({ value: p.id, label: p.name }))}
        defaultValues={{
          name: techCard.name,
          outputItemId: techCard.outputItemId,
          outputQuantity: techCard.outputQuantity.toString(),
          components: techCard.components.map((c) => ({
            catalogItemId: c.catalogItemId,
            quantity: c.quantity.toString(),
          })),
        }}
      />
    </div>
  );
}
