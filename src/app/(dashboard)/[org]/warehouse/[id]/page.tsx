import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { getItemBalanceAtStore, getReservedQuantitiesByStore } from "@/lib/stock";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { variantLabel } from "@/lib/catalog-variants";
import { DraftDemandEditor, type DraftDemandLine } from "@/components/warehouse/draft-demand-editor";
import { DraftMoveEditor, type DraftMoveLine } from "@/components/warehouse/draft-move-editor";
import { DraftSupplyEditor, type DraftSupplyLine } from "@/components/warehouse/draft-supply-editor";
import { getComments } from "@/lib/comments";
import { EventFeed } from "@/components/comments/event-feed";
import { listAttachments } from "@/lib/attachments";
import { AttachmentList } from "@/components/attachments/attachment-list";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

const TYPE_LABEL: Record<string, string> = {
  ENTER: "Оприходование",
  LOSS: "Списание",
  MOVE: "Перемещение",
  INVENTORY: "Инвентаризация",
  DEMAND: "Отгрузка",
  SUPPLY: "Приёмка",
  SALES_RETURN: "Возврат от клиента",
  PURCHASE_RETURN: "Возврат поставщику",
  RETAIL_SALE: "Розничная продажа",
  RETAIL_RETURN: "Розничный возврат",
};

export default async function MovementDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  const movement = await prisma.stockMovement.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      store: true,
      toStore: true,
      order: true,
      purchaseOrder: true,
      lines: {
        include: {
          catalogItem: true,
          variant: { include: { values: { include: { characteristic: true } } } },
        },
      },
    },
  });

  if (!movement) {
    notFound();
  }

  const comments = await getComments(ctx.orgId, "StockMovement", movement.id, ctx.employeeId);
  const attachments = await listAttachments(ctx.orgId, "StockMovement", movement.id);

  // "Создать документ" flow: an unposted DEMAND renders an editable form
  // (store + per-line quantities) instead of the read-only lines table
  // below — everything else on this page (header card, order/PO links)
  // stays the same for both draft and posted movements.
  const isDraftDemand = movement.type === "DEMAND" && !movement.isPosted;
  let draftEditorProps: { storeOptions: { value: string; label: string }[]; lines: DraftDemandLine[] } | null = null;
  if (isDraftDemand) {
    const stores = await prisma.store.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    const reservedByOthers = movement.orderId
      ? await getReservedQuantitiesByStore(ctx.orgId, movement.storeId, movement.orderId)
      : new Map<string, number>();
    const lines = await Promise.all(
      movement.lines.map(async (line) => {
        const balance = await getItemBalanceAtStore(ctx.orgId, movement.storeId, line.catalogItemId, line.variantId);
        const reserved = reservedByOthers.get(`${line.catalogItemId}:${line.variantId ?? ""}`) ?? 0;
        return {
          catalogItemId: line.catalogItemId,
          variantId: line.variantId,
          name:
            line.catalogItem.name +
            (line.variant ? ` — ${variantLabel(line.variant.values) || (line.variant.sku ?? line.variant.id)}` : ""),
          quantity: line.quantity.toString(),
          available: Math.max(0, balance - reserved),
        };
      }),
    );
    draftEditorProps = { storeOptions: stores.map((s) => ({ value: s.id, label: s.name })), lines };
  }

  // Same idiom as isDraftDemand above, mirrored for MOVE (Block K
  // remainder) — no reservation/availability hint needed here (MOVE
  // doesn't reserve), just the plain remaining quantity as a starting value.
  const isDraftMove = movement.type === "MOVE" && !movement.isPosted;
  let draftMoveEditorProps: { storeOptions: { value: string; label: string }[]; lines: DraftMoveLine[] } | null = null;
  if (isDraftMove) {
    const stores = await prisma.store.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    const lines = movement.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      variantId: line.variantId,
      name:
        line.catalogItem.name +
        (line.variant ? ` — ${variantLabel(line.variant.values) || (line.variant.sku ?? line.variant.id)}` : ""),
      quantity: line.quantity.toString(),
    }));
    draftMoveEditorProps = { storeOptions: stores.map((s) => ({ value: s.id, label: s.name })), lines };
  }

  // Same idiom again, mirrored for SUPPLY (Block K remainder) — no
  // reservation hint (SUPPLY doesn't reserve either), just remaining
  // quantities as a starting value like MOVE above.
  const isDraftSupply = movement.type === "SUPPLY" && !movement.isPosted;
  let draftSupplyEditorProps: { storeOptions: { value: string; label: string }[]; lines: DraftSupplyLine[] } | null =
    null;
  if (isDraftSupply) {
    const stores = await prisma.store.findMany({
      where: { orgId: ctx.orgId, status: "ACTIVE" },
      orderBy: { name: "asc" },
    });
    const lines = movement.lines.map((line) => ({
      catalogItemId: line.catalogItemId,
      variantId: line.variantId,
      name:
        line.catalogItem.name +
        (line.variant ? ` — ${variantLabel(line.variant.values) || (line.variant.sku ?? line.variant.id)}` : ""),
      quantity: line.quantity.toString(),
    }));
    draftSupplyEditorProps = { storeOptions: stores.map((s) => ({ value: s.id, label: s.name })), lines };
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {TYPE_LABEL[movement.type]} №{movement.number}
        </h1>
        {(isDraftDemand || isDraftMove || isDraftSupply) && <Badge variant="secondary">Черновик</Badge>}
        <Badge variant="secondary">
          {movement.createdAt.toLocaleDateString("ru-RU")}
        </Badge>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Склад: </span>
            {movement.type === "MOVE"
              ? `${movement.store.name} → ${movement.toStore?.name ?? "—"}`
              : movement.store.name}
          </div>
          {movement.order && (
            <div>
              <span className="text-muted-foreground">Заказ: </span>
              <Link href={`/${org}/orders/${movement.order.id}`} className="underline">
                №{movement.order.number}
              </Link>
            </div>
          )}
          {movement.purchaseOrder && (
            <div>
              <span className="text-muted-foreground">Заказ поставщику: </span>
              <Link
                href={`/${org}/purchase-orders/${movement.purchaseOrder.id}`}
                className="underline"
              >
                №{movement.purchaseOrder.number}
              </Link>
            </div>
          )}
          {movement.comment && (
            <div>
              <span className="text-muted-foreground">Комментарий: </span>
              {movement.comment}
            </div>
          )}
        </CardContent>
      </Card>

      {draftEditorProps ? (
        <DraftDemandEditor
          orgSlug={org}
          movementId={movement.id}
          storeOptions={draftEditorProps.storeOptions}
          defaultStoreId={movement.storeId}
          lines={draftEditorProps.lines}
        />
      ) : draftMoveEditorProps ? (
        <DraftMoveEditor
          orgSlug={org}
          movementId={movement.id}
          storeOptions={draftMoveEditorProps.storeOptions}
          defaultStoreId={movement.storeId}
          lines={draftMoveEditorProps.lines}
        />
      ) : draftSupplyEditorProps ? (
        <DraftSupplyEditor
          orgSlug={org}
          movementId={movement.id}
          storeOptions={draftSupplyEditorProps.storeOptions}
          defaultStoreId={movement.storeId}
          lines={draftSupplyEditorProps.lines}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Товар</TableHead>
                {movement.type === "INVENTORY" ? (
                  <>
                    <TableHead className="text-right">Числилось</TableHead>
                    <TableHead className="text-right">Факт</TableHead>
                    <TableHead className="text-right">Корректировка</TableHead>
                  </>
                ) : (
                  <TableHead className="text-right">Количество</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {movement.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell>
                    {line.catalogItem.name}
                    {line.variant ? ` — ${variantLabel(line.variant.values) || (line.variant.sku ?? line.variant.id)}` : ""}
                  </TableCell>
                  {movement.type === "INVENTORY" ? (
                    <>
                      <TableCell className="text-right">
                        {line.countedQuantity !== null
                          ? (
                              Number(line.countedQuantity) - Number(line.quantity)
                            ).toString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {line.countedQuantity?.toString() ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {Number(line.quantity) > 0 ? "+" : ""}
                        {line.quantity.toString()}
                      </TableCell>
                    </>
                  ) : (
                    <TableCell className="text-right">{line.quantity.toString()}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <AttachmentList
        orgSlug={org}
        entityType="StockMovement"
        entityId={movement.id}
        revalidateHref={`/${org}/warehouse/${movement.id}`}
        attachments={attachments}
      />
      <EventFeed
        orgSlug={org}
        entityType="StockMovement"
        entityId={movement.id}
        revalidateHref={`/${org}/warehouse/${movement.id}`}
        comments={comments}
      />
    </div>
  );
}
