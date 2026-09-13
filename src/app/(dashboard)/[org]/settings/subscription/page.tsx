import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import { SubscriptionPlanPicker } from "@/components/settings/subscription-plan-picker";
import { CustomPlanBuilder } from "@/components/settings/custom-plan-builder";
import { AddOnFeaturesSection } from "@/components/settings/add-on-features-section";

const ACTION_LABEL: Record<string, string> = {
  GRANTED: "Выдана",
  CHANGED: "Изменена",
  REVOKED: "Отозвана",
  EXPIRED: "Истекла",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Ожидает оплаты",
  PAID: "Оплачен",
  CANCELLED: "Отменён",
};

/**
 * Блок Q — self-service subscription: balance, current state (trial/
 * active/grace/restricted, computed by resolveSubscriptionState and
 * already carried on ctx from getOrgContext), fixed-plan picker, "Свой
 * тариф" constructor, and invoice/balance history for transparency (same
 * principle Блок L фаза 3 already applied to the tariff-change log).
 * Balance top-up itself stays support-only text — no payment provider and
 * no in-app messaging system to route such a request yet (see
 * docs/handbook/payment-provider-setup.md).
 */
export default async function OrgSubscriptionPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: orgSlug } = await params;
  const ctx = await getOrgContext(orgSlug);
  if (ctx.role !== "ADMIN") notFound();

  const [organization, history, invoices, balanceTransactions, plans, catalogItems] = await Promise.all([
    prisma.organization.findUnique({ where: { id: ctx.orgId } }),
    prisma.subscriptionChangeLog.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      include: { beforePlan: true, afterPlan: true },
      take: 50,
    }),
    prisma.subscriptionInvoice.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.balanceTransaction.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.subscriptionPlan.findMany({ where: { isCustom: false }, orderBy: { priceMonthly: "asc" } }),
    prisma.subscriptionFeatureCatalogItem.findMany({ where: { status: "ACTIVE" }, orderBy: { label: "asc" } }),
  ]);
  if (!organization) notFound();

  const state = ctx.subscriptionState;
  const featureCatalogItems = catalogItems.filter((i) => i.kind === "FEATURE");
  const featureRows = featureCatalogItems.map((i) => ({
    key: i.key,
    label: i.label,
    includedInAllPlans: i.includedInAllPlans,
  }));
  const addOnItems = featureCatalogItems.filter(
    (i) => !i.includedInAllPlans && !ctx.enabledFeatures.has(i.key),
  );

  return (
    <div className="flex flex-col gap-4">
      <SettingsSubnav org={orgSlug} active="subscription" />
      <h1 className="text-2xl font-semibold">Подписка</h1>

      {state.kind === "TRIAL" && (
        <Card className="border-blue-300">
          <CardContent className="pt-6 text-sm">
            Пробный период — полный доступ до {state.endsAt.toLocaleDateString("ru-RU")}. Оформите тариф до
            окончания пробного периода, чтобы доступ не был ограничен.
          </CardContent>
        </Card>
      )}
      {state.kind === "GRACE" && (
        <Card className="border-amber-400">
          <CardContent className="pt-6 text-sm">
            Оплата за тариф «{state.plan.name}» не прошла — на балансе не хватило средств. Функции пока работают в
            полном объёме, но если баланс не пополнить до {state.graceEndsAt.toLocaleDateString("ru-RU")}, доступ
            ограничится до просмотра.
          </CardContent>
        </Card>
      )}
      {state.kind === "RESTRICTED" && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm">
            Доступ ограничен до просмотра — подписка не активна. Оформите тариф ниже, чтобы вернуть полный доступ;
            если на балансе уже достаточно средств, тариф активируется автоматически сразу после оформления.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Баланс</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p className="text-lg font-semibold">{formatMoney(Number(organization.balance), organization.baseCurrency)}</p>
          <p className="text-muted-foreground">
            Чтобы пополнить баланс, обратитесь в поддержку — автоматическое пополнение появится вместе с подключением
            платёжного провайдера.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Текущий тариф</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {state.kind === "ACTIVE" || state.kind === "GRACE" ? (
            <>
              <div>
                <Badge variant={state.kind === "ACTIVE" ? "default" : "outline"}>{state.plan.name}</Badge>
              </div>
              <div className="text-muted-foreground">
                {formatMoney(Number(state.plan.priceMonthly), state.plan.currency)} / месяц
              </div>
              {state.plan.maxEmployees && (
                <div className="text-muted-foreground">Лимит сотрудников: {state.plan.maxEmployees}</div>
              )}
              {state.kind === "ACTIVE" && organization.subscriptionExpiresAt && (
                <div className="text-muted-foreground">
                  Действует до: {organization.subscriptionExpiresAt.toLocaleDateString("ru-RU")}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Тариф не назначен</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Готовые тарифы</CardTitle>
        </CardHeader>
        <CardContent>
          <SubscriptionPlanPicker
            orgSlug={orgSlug}
            plans={plans.map((p) => ({
              id: p.id,
              name: p.name,
              priceMonthly: p.priceMonthly.toString(),
              currency: p.currency,
              maxEmployees: p.maxEmployees,
              maxOrdersPerMonth: p.maxOrdersPerMonth,
              features:
                p.features && typeof p.features === "object" && !Array.isArray(p.features)
                  ? (p.features as Record<string, boolean>)
                  : {},
            }))}
            featureRows={featureRows}
          />
        </CardContent>
      </Card>

      <AddOnFeaturesSection
        orgSlug={orgSlug}
        items={addOnItems.map((i) => ({
          id: i.id,
          label: i.label,
          description: i.description,
          unitPrice: i.unitPrice.toString(),
          currency: organization.baseCurrency,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Свой тариф</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomPlanBuilder
            orgSlug={orgSlug}
            currency={organization.baseCurrency}
            items={catalogItems
              // Block S — items free for every org (includedInAllPlans)
              // aren't offered here to "buy" — the constructor is only
              // for what actually costs something.
              .filter((i) => !i.includedInAllPlans)
              .map((i) => ({
                id: i.id,
                key: i.key,
                label: i.label,
                description: i.description,
                kind: i.kind,
                unitPrice: i.unitPrice.toString(),
              }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Счета</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Счетов пока не было</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>№</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Создан</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>{invoice.number}</TableCell>
                      <TableCell className="text-right">{formatMoney(Number(invoice.amount), invoice.currency)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {invoice.createdAt.toLocaleString("ru-RU")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">История баланса</CardTitle>
        </CardHeader>
        <CardContent>
          {balanceTransactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Операций пока не было</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="text-right">Баланс после</TableHead>
                    <TableHead>Комментарий</TableHead>
                    <TableHead>Когда</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balanceTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-right">
                        {formatMoney(Number(tx.amount), organization.baseCurrency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatMoney(Number(tx.balanceAfter), organization.baseCurrency)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{tx.note ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{tx.createdAt.toLocaleString("ru-RU")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">История тарифа</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Изменений пока не было</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Действие</TableHead>
                    <TableHead>Было</TableHead>
                    <TableHead>Стало</TableHead>
                    <TableHead>Когда</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{ACTION_LABEL[entry.action] ?? entry.action}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.beforePlan?.name ?? "—"}</TableCell>
                      <TableCell>{entry.afterPlan?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.createdAt.toLocaleString("ru-RU")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
