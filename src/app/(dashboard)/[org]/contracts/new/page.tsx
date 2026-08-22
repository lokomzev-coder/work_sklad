import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createContract } from "@/actions/contracts";
import { ContractForm } from "@/components/contracts/contract-form";

export default async function NewContractPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const boundAction = createContract.bind(null, org);

  const clients = await prisma.client.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый договор</h1>
      <ContractForm
        orgSlug={org}
        action={boundAction}
        clientOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
      />
    </div>
  );
}
