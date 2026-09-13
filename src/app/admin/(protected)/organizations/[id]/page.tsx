import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { OrganizationSubscriptionForm } from "@/components/admin/organization-subscription-form";
import { CreditBalanceForm } from "@/components/admin/credit-balance-form";
import { formatMoney } from "@/lib/format";

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

export default async function PlatformOrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();
  assertPlatformPermission(ctx, "viewOrganizations");
  const { id } = await params;

  const org = await prisma.organization.findUnique({
    where: { id },
    include: {
      subscriptionPlan: true,
      _count: { select: { memberships: true } },
    },
  });
  if (!org) {
    notFound();
  }

  const canManageSubscriptions = ctx.capabilities.manageSubscriptions;
  const [plans, history, invoices] = await Promise.all([
    canManageSubscriptions
      ? prisma.subscriptionPlan.findMany({ where: { isCustom: false }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    prisma.subscriptionChangeLog.findMany({
      where: { orgId: id },
      orderBy: { createdAt: "desc" },
      include: { beforePlan: true, afterPlan: true, platformAdmin: true },
      take: 50,
    }),
    prisma.subscriptionInvoice.findMany({
      where: { orgId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{org.name}</h1>
        {ctx.capabilities.viewAuditLog && (
          <Link href={`${base}/audit-log?orgId=${org.id}`} className="text-sm underline">
            Журнал аудита по этой организации
          </Link>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        slug: {org.slug} · участников: {org._count.memberships} · создана {org.createdAt.toLocaleDateString("ru-RU")}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Баланс</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-lg font-semibold">{formatMoney(Number(org.balance), org.baseCurrency)}</p>
          {canManageSubscriptions && <CreditBalanceForm orgId={org.id} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Подписка</CardTitle>
        </CardHeader>
        <CardContent>
          {canManageSubscriptions ? (
            <OrganizationSubscriptionForm
              orgId={org.id}
              currentPlanId={org.subscriptionPlanId}
              currentExpiresAt={org.subscriptionExpiresAt ? org.subscriptionExpiresAt.toISOString().slice(0, 10) : null}
              plans={plans.map((p) => ({ id: p.id, name: p.name }))}
            />
          ) : (
            <p className="text-sm">
              {org.subscriptionPlan ? org.subscriptionPlan.name : "Без тарифа"}
              {org.subscriptionExpiresAt && ` — до ${org.subscriptionExpiresAt.toLocaleDateString("ru-RU")}`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">История подписки</CardTitle>
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
                    <TableHead>Кто</TableHead>
                    <TableHead>Когда</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{ACTION_LABEL[entry.action] ?? entry.action}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.beforePlan?.name ?? "—"}</TableCell>
                      <TableCell>{entry.afterPlan?.name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{entry.platformAdmin?.name ?? "—"}</TableCell>
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
                    <TableHead>Оплачен</TableHead>
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
                      <TableCell className="text-muted-foreground">
                        {invoice.paidAt ? invoice.paidAt.toLocaleString("ru-RU") : "—"}
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
