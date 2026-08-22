import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateStore } from "@/actions/stores";
import { StoreForm } from "@/components/warehouse/store-form";

export default async function EditStorePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const store = await prisma.store.findFirst({
    where: { id, orgId: ctx.orgId },
  });

  if (!store) {
    notFound();
  }

  const boundAction = updateStore.bind(null, org, store.id);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{store.name}</h1>
      <StoreForm
        orgSlug={org}
        action={boundAction}
        defaultValues={{ name: store.name, address: store.address }}
        submitLabel="Сохранить"
      />
    </div>
  );
}
