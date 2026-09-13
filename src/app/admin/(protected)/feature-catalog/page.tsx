import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { CreateFeatureCatalogItemInline } from "@/components/admin/create-feature-catalog-item-inline";

const KIND_LABEL: Record<string, string> = {
  FEATURE: "Функция",
  EXTRA_EMPLOYEE_SEAT: "Доп. место сотрудника",
};

/**
 * Блок Q — the building blocks the org-side "Свой тариф" constructor picks
 * from (src/lib/billing/subscription-billing.ts::createOrDraftInvoice).
 * Same manageSubscriptions capability and CRUD shape as /admin/plans.
 */
export default async function FeatureCatalogPage() {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();
  assertPlatformPermission(ctx, "manageSubscriptions");

  const items = await prisma.subscriptionFeatureCatalogItem.findMany({
    orderBy: [{ status: "asc" }, { label: "asc" }],
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Каталог функций конструктора</h1>
        <CreateFeatureCatalogItemInline />
      </div>
      <p className="text-sm text-muted-foreground">
        Пункты, из которых организация собирает «Свой тариф» на странице подписки — сумма выбранных пунктов
        становится ценой тарифа.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Ключ</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead className="text-right">Цена</TableHead>
              <TableHead>Включено всем</TableHead>
              <TableHead>Статус</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Пунктов пока нет
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link href={`${base}/feature-catalog/${item.id}`} className="underline">
                      {item.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.key}</TableCell>
                  <TableCell>{KIND_LABEL[item.kind] ?? item.kind}</TableCell>
                  <TableCell className="text-right">{formatMoney(Number(item.unitPrice), "RUB")}</TableCell>
                  <TableCell>{item.includedInAllPlans ? "Да" : "—"}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "ACTIVE" ? "default" : "outline"}>
                      {item.status === "ACTIVE" ? "Активен" : "В архиве"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
