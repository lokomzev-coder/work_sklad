import { prisma } from "@/lib/prisma";

export type ArchivableEntityType =
  | "employee"
  | "client"
  | "catalogItem"
  | "vaultServiceEntry"
  | "store";

const ENTITY_LABEL: Record<ArchivableEntityType, string> = {
  employee: "Сотрудник",
  client: "Клиент",
  catalogItem: "Позиция каталога",
  vaultServiceEntry: "Запись сервиса",
  store: "Склад",
};

interface ReferenceCheck {
  referenced: boolean;
  reason?: string;
}

async function checkReferences(
  type: ArchivableEntityType,
  id: string,
): Promise<ReferenceCheck> {
  switch (type) {
    case "client": {
      const [orderCount, purchaseOrderCount, paymentCount] = await Promise.all([
        prisma.order.count({ where: { clientId: id } }),
        prisma.purchaseOrder.count({ where: { supplierId: id } }),
        prisma.payment.count({ where: { counterpartyId: id } }),
      ]);
      if (orderCount > 0) {
        return { referenced: true, reason: `фигурирует в ${orderCount} заказ(ах)` };
      }
      if (purchaseOrderCount > 0) {
        return {
          referenced: true,
          reason: `указан поставщиком в ${purchaseOrderCount} заказ(ах) поставщику`,
        };
      }
      if (paymentCount > 0) {
        return { referenced: true, reason: `фигурирует в ${paymentCount} платеж(ах)` };
      }
      return { referenced: false };
    }
    case "employee": {
      const [orderCount, purchaseOrderCount, vaultAccessCount] = await Promise.all([
        prisma.order.count({ where: { assignedEmployeeId: id } }),
        prisma.purchaseOrder.count({ where: { assignedEmployeeId: id } }),
        prisma.employeeVaultAccess.count({ where: { employeeId: id } }),
      ]);
      if (orderCount > 0) {
        return {
          referenced: true,
          reason: `назначен ответственным в ${orderCount} заказ(ах)`,
        };
      }
      if (purchaseOrderCount > 0) {
        return {
          referenced: true,
          reason: `назначен ответственным в ${purchaseOrderCount} заказ(ах) поставщику`,
        };
      }
      if (vaultAccessCount > 0) {
        return {
          referenced: true,
          reason: `имеет доступ к ${vaultAccessCount} записи(ям) паролей`,
        };
      }
      return { referenced: false };
    }
    case "catalogItem": {
      const [orderCount, purchaseOrderCount, bundleCount, movementCount] = await Promise.all([
        prisma.orderLineItem.count({ where: { catalogItemId: id } }),
        prisma.purchaseOrderLineItem.count({ where: { catalogItemId: id } }),
        prisma.catalogItemComponent.count({ where: { componentId: id } }),
        prisma.stockMovementLine.count({ where: { catalogItemId: id } }),
      ]);
      if (orderCount > 0) {
        return { referenced: true, reason: `используется в ${orderCount} позици(ях) заказов` };
      }
      if (purchaseOrderCount > 0) {
        return {
          referenced: true,
          reason: `используется в ${purchaseOrderCount} позици(ях) заказов поставщику`,
        };
      }
      if (bundleCount > 0) {
        return { referenced: true, reason: `входит в состав ${bundleCount} комплект(ов)` };
      }
      if (movementCount > 0) {
        return { referenced: true, reason: `фигурирует в ${movementCount} складск(их) движени(ях)` };
      }
      return { referenced: false };
    }
    case "vaultServiceEntry": {
      const count = await prisma.employeeVaultAccess.count({
        where: { vaultEntryId: id },
      });
      return count > 0
        ? { referenced: true, reason: `доступ выдан ${count} сотрудник(ам)` }
        : { referenced: false };
    }
    case "store": {
      const count = await prisma.stockMovement.count({
        where: { OR: [{ storeId: id }, { toStoreId: id }] },
      });
      return count > 0
        ? { referenced: true, reason: `по складу проведено ${count} движени(й)` }
        : { referenced: false };
    }
  }
}

export interface ArchiveOrDeleteResult {
  deleted?: boolean;
  archived?: boolean;
  reason?: string;
}

/**
 * Deletes the entity if nothing references it; otherwise archives it and
 * reports why. This is the single choke point every "delete" Server Action
 * for an archivable entity must go through — a plain prisma.<model>.delete()
 * would silently null out the FK on any Order that points at the row
 * (Prisma's default onDelete for optional relations is SetNull, not
 * Restrict), quietly corrupting order history.
 */
export async function archiveOrDelete(
  type: ArchivableEntityType,
  id: string,
  orgId: string,
): Promise<ArchiveOrDeleteResult> {
  const { referenced, reason } = await checkReferences(type, id);

  if (!referenced) {
    switch (type) {
      case "employee":
        await prisma.employee.delete({ where: { id, orgId } });
        break;
      case "client":
        await prisma.client.delete({ where: { id, orgId } });
        break;
      case "catalogItem":
        await prisma.catalogItem.delete({ where: { id, orgId } });
        break;
      case "vaultServiceEntry":
        await prisma.vaultServiceEntry.delete({ where: { id, orgId } });
        break;
      case "store":
        await prisma.store.delete({ where: { id, orgId } });
        break;
    }
    return { deleted: true };
  }

  switch (type) {
    case "employee":
      await prisma.employee.update({
        where: { id, orgId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      break;
    case "client":
      await prisma.client.update({
        where: { id, orgId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      break;
    case "catalogItem":
      await prisma.catalogItem.update({
        where: { id, orgId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      break;
    case "vaultServiceEntry":
      await prisma.vaultServiceEntry.update({
        where: { id, orgId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      break;
    case "store":
      await prisma.store.update({
        where: { id, orgId },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      break;
  }

  return {
    archived: true,
    reason: `${ENTITY_LABEL[type]} нельзя удалить: ${reason}. Запись перемещена в архив.`,
  };
}
