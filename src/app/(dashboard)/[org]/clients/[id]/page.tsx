import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateClient } from "@/actions/clients";
import { ClientForm } from "@/components/clients/client-form";
import { getClientBalance } from "@/lib/balances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientContactsSection } from "@/components/clients/client-contacts-section";

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
  const balance = await getClientBalance(ctx.orgId, client.id);
  const contacts = await prisma.clientContact.findMany({
    where: { clientId: client.id },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{client.name}</h1>
      <ClientForm
        orgSlug={org}
        action={boundAction}
        defaultValues={client}
        submitLabel="Сохранить"
      />
      {(balance.receivable !== 0 || balance.payable !== 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Взаиморасчёты</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div>
              <span className="text-muted-foreground">Должен нам: </span>
              {balance.receivable.toFixed(2)} ₽
            </div>
            <div>
              <span className="text-muted-foreground">Должны ему (как поставщику): </span>
              {balance.payable.toFixed(2)} ₽
            </div>
          </CardContent>
        </Card>
      )}
      <ClientContactsSection orgSlug={org} clientId={client.id} contacts={contacts} />
    </div>
  );
}
