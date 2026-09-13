import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import type { Resource } from "@/lib/permissions";
import { readStoredFile } from "@/lib/file-storage";

export const dynamic = "force-dynamic";

/** Same map as actions/attachments.ts — kept in sync there, not imported,
 * since that file is "use server" (action-only exports) and this route
 * needs it as plain data. */
const ENTITY_TYPE_TO_RESOURCE: Record<string, Resource> = {
  CatalogItem: "catalog",
  Order: "orders",
  PurchaseOrder: "purchaseOrders",
  InvoiceOut: "invoicesOut",
  InvoiceIn: "invoicesIn",
  StockMovement: "warehouse",
  ProductionOrder: "productionOrders",
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Не авторизован", { status: 401 });
  }

  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) {
    return new NextResponse("Файл не найден", { status: 404 });
  }

  // The requesting user must belong to the org that owns this file, AND
  // have view permission on whatever kind of thing it's attached to — same
  // bar as reaching the page that shows the attachment list at all.
  const membership = (session.memberships ?? []).find((m) => m.orgId === attachment.orgId);
  if (!membership) {
    return new NextResponse("Файл не найден", { status: 404 });
  }
  const ctx = await getOrgContext(membership.orgSlug);
  const resource = ENTITY_TYPE_TO_RESOURCE[attachment.entityType];
  if (!resource || !can(ctx, resource, "view")) {
    return new NextResponse("Недостаточно прав", { status: 403 });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(attachment.storagePath);
  } catch {
    return new NextResponse("Файл не найден на диске", { status: 404 });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
