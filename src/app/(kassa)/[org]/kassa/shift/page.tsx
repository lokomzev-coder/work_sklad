import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getOrgBaseCurrency } from "@/lib/currency";
import { ShiftPanel } from "@/components/kassa/shift-panel";

export default async function KassaShiftPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  if (!ctx.defaultStoreId) {
    return (
      <p className="mx-auto max-w-sm text-center text-sm text-muted-foreground">
        Обратитесь к администратору: не назначена точка продаж.
      </p>
    );
  }

  const shift = await prisma.retailShift.findFirst({
    where: { orgId: ctx.orgId, storeId: ctx.defaultStoreId, status: "OPEN" },
    include: { cashTransactions: { orderBy: { createdAt: "desc" } } },
  });

  if (!shift) {
    return <p className="mx-auto max-w-sm text-center text-sm text-muted-foreground">Смена не открыта.</p>;
  }

  const currency = await getOrgBaseCurrency(ctx.orgId);

  return (
    <ShiftPanel
      orgSlug={org}
      shiftId={shift.id}
      openingCashAmount={shift.openingCashAmount.toString()}
      currency={currency}
      cashTransactions={shift.cashTransactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount.toString(),
        comment: t.comment,
        createdAt: t.createdAt.toLocaleString("ru-RU"),
      }))}
    />
  );
}
