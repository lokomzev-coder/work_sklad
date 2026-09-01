import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { ExchangeRatesManager } from "@/components/settings/exchange-rates-manager";

export default async function CurrenciesPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "exchangeRates", "view")) notFound();

  const [orgRow, rates] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { baseCurrency: true } }),
    prisma.exchangeRate.findMany({ where: { orgId: ctx.orgId }, orderBy: { effectiveAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="currencies" />
      <h1 className="text-2xl font-semibold">Валюта</h1>
      <ExchangeRatesManager
        orgSlug={org}
        baseCurrency={orgRow.baseCurrency}
        rates={rates.map((r) => ({
          id: r.id,
          currency: r.currency,
          rateToBase: r.rateToBase.toString(),
          effectiveAt: r.effectiveAt.toLocaleDateString("ru-RU"),
        }))}
      />
    </div>
  );
}
