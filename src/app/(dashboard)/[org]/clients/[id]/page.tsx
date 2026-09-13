import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { isRowVisible } from "@/lib/scope";
import { updateClient } from "@/actions/clients";
import { ClientForm } from "@/components/clients/client-form";
import { getClientBalance } from "@/lib/balances";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientContactsSection } from "@/components/clients/client-contacts-section";
import { ClientAddressesSection } from "@/components/clients/client-addresses-section";
import { CounterpartyAdjustmentsSection } from "@/components/clients/counterparty-adjustments-section";
import { listCustomFieldDefinitions, getCustomFieldValues } from "@/lib/custom-fields";
import { formatMoney } from "@/lib/format";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "clients", "view")) notFound();

  const client = await prisma.client.findFirst({
    where: { id, orgId: ctx.orgId },
  });

  if (!client) {
    notFound();
  }
  if (!(await isRowVisible(ctx, "clients", client.assignedEmployeeId))) {
    notFound();
  }

  const boundAction = updateClient.bind(null, org, client.id);
  const balance = await getClientBalance(ctx.orgId, client.id);
  const contacts = await prisma.clientContact.findMany({
    where: { clientId: client.id },
    orderBy: { name: "asc" },
  });
  const addresses = await prisma.clientAddress.findMany({
    where: { clientId: client.id },
    orderBy: { label: "asc" },
  });
  const [customFieldDefs, customFieldValues, adjustments] = await Promise.all([
    listCustomFieldDefinitions(ctx.orgId, "CLIENT"),
    getCustomFieldValues(client.id),
    prisma.counterpartyAdjustment.findMany({ where: { orgId: ctx.orgId, clientId: client.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">{client.name}</h1>
      <ClientForm
        orgSlug={org}
        action={boundAction}
        defaultValues={client}
        submitLabel="Сохранить"
        customFieldDefs={customFieldDefs}
        customFieldValues={customFieldValues}
      />
      {(balance.receivable !== 0 || balance.payable !== 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Взаиморасчёты</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 text-sm">
            <div>
              <span className="text-muted-foreground">Должен нам: </span>
              {formatMoney(balance.receivable, balance.baseCurrency)}
            </div>
            <div>
              <span className="text-muted-foreground">Должны ему (как поставщику): </span>
              {formatMoney(balance.payable, balance.baseCurrency)}
            </div>
          </CardContent>
        </Card>
      )}
      <ClientContactsSection orgSlug={org} clientId={client.id} contacts={contacts} />
      <ClientAddressesSection orgSlug={org} clientId={client.id} addresses={addresses} />
      <CounterpartyAdjustmentsSection
        orgSlug={org}
        clientId={client.id}
        baseCurrency={balance.baseCurrency}
        adjustments={adjustments.map((a) => ({
          id: a.id,
          side: a.side,
          amount: a.amount.toString(),
          comment: a.comment,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
