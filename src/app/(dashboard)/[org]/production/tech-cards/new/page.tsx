import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { TechCardForm } from "@/components/production/tech-card-form";

export default async function NewTechCardPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [products, techProcesses] = await Promise.all([
    prisma.catalogItem.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE", type: "PRODUCT" },
      orderBy: { name: "asc" },
    }),
    prisma.techProcess.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      include: { positions: { include: { processingStage: true }, orderBy: { position: "asc" } } },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая технологическая карта</h1>
      <TechCardForm
        orgSlug={org}
        techCardId={null}
        productOptions={products.map((p) => ({ value: p.id, label: p.name }))}
        techProcesses={techProcesses.map((tp) => ({
          id: tp.id,
          name: tp.name,
          positions: tp.positions.map((p) => ({ id: p.id, stageName: p.processingStage.name })),
        }))}
      />
    </div>
  );
}
