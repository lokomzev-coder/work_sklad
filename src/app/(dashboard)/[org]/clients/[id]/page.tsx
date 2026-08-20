import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateClient } from "@/actions/clients";
import { ClientForm } from "@/components/clients/client-form";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const client = await prisma.client.findFirst({
    where: { id, orgId: ctx.orgId },
  });

  if (!client) {
    notFound();
  }

  const boundAction = updateClient.bind(null, org, client.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{client.name}</h1>
      <ClientForm
        orgSlug={org}
        action={boundAction}
        defaultValues={client}
        submitLabel="Сохранить"
      />
    </div>
  );
}
