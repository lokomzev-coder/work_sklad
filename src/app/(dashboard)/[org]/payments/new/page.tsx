import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { createPayment } from "@/actions/payments";
import { PaymentForm } from "@/components/payments/payment-form";

export default async function NewPaymentPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  const boundAction = createPayment.bind(null, org);

  const clients = await prisma.client.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новый платёж</h1>
      <PaymentForm
        orgSlug={org}
        action={boundAction}
        counterpartyOptions={clients.map((c) => ({ value: c.id, label: c.name }))}
      />
    </div>
  );
}
