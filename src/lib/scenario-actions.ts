import { prisma } from "@/lib/prisma";
import { deliverToWebhookNow } from "@/lib/webhooks";
import { createInvoiceOutFromOrderRecord } from "@/actions/invoices-out";
import { createInvoiceInFromPurchaseOrderRecord } from "@/actions/invoices-in";
import type { WebhookEvent, Role } from "@/generated/prisma/enums";
import type { ScenarioActionType } from "@/generated/prisma/enums";
import type { DocumentSnapshot } from "@/lib/scenarios";

interface CreateRelatedDocumentConfig {
  targetType: "INVOICE_OUT" | "INVOICE_IN";
}

// Empty across all three = notify NO ONE — the inverse of
// DocumentStatusTransition's allowedRoles/etc, where empty means
// unrestricted. A forgotten field in the rule editor must not turn into
// spamming the whole organization.
interface CreateNotificationConfig {
  allowedRoles: Role[];
  allowedCustomRoleIds: string[];
  allowedEmployeeIds: string[];
  title: string;
  body: string;
}

interface SendWebhookConfig {
  webhookId: string;
}

async function executeCreateRelatedDocument(config: CreateRelatedDocumentConfig, snapshot: DocumentSnapshot): Promise<void> {
  // Only these two pairs have any real conversion logic (Block M5
  // precedent) — no generic converter. Any other combination isn't
  // reachable through the rule editor (it only offers this action when the
  // rule's documentType is ORDER or PURCHASE_ORDER), so this is a
  // defensive no-op, not a real UI path.
  if (snapshot.documentType === "ORDER" && config.targetType === "INVOICE_OUT") {
    const result = await createInvoiceOutFromOrderRecord(snapshot.orgId, snapshot.id);
    if ("error" in result) console.error(`[scenarios] CREATE_RELATED_DOCUMENT failed:`, result.error);
  } else if (snapshot.documentType === "PURCHASE_ORDER" && config.targetType === "INVOICE_IN") {
    const result = await createInvoiceInFromPurchaseOrderRecord(snapshot.orgId, snapshot.id);
    if ("error" in result) console.error(`[scenarios] CREATE_RELATED_DOCUMENT failed:`, result.error);
  } else {
    console.warn(`[scenarios] CREATE_RELATED_DOCUMENT: no conversion from ${snapshot.documentType} to ${config.targetType}`);
  }
}

async function executeCreateNotification(config: CreateNotificationConfig, snapshot: DocumentSnapshot): Promise<void> {
  const orFilters = [
    config.allowedRoles.length > 0 ? { role: { in: config.allowedRoles } } : undefined,
    config.allowedCustomRoleIds.length > 0 ? { customRoleId: { in: config.allowedCustomRoleIds } } : undefined,
    config.allowedEmployeeIds.length > 0 ? { employeeId: { in: config.allowedEmployeeIds } } : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  if (orFilters.length === 0) return; // nothing configured -> notify no one

  const memberships = await prisma.membership.findMany({
    where: { orgId: snapshot.orgId, OR: orFilters },
    select: { userId: true },
  });
  if (memberships.length === 0) return;

  const userIds = [...new Set(memberships.map((m) => m.userId))];
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      orgId: snapshot.orgId,
      userId,
      title: config.title,
      body: config.body,
      documentType: snapshot.documentType,
      documentId: snapshot.id,
    })),
  });
}

function executeSendWebhook(
  config: SendWebhookConfig,
  snapshot: DocumentSnapshot,
  webhookEvent: WebhookEvent,
  webhookPayload: Record<string, unknown>,
): void {
  // Deliberately bypasses the target Webhook's own `events` subscription
  // list — the scenario author explicitly picked this webhook for this
  // rule, that's a stronger signal than the webhook's general subscription
  // config. Fire-and-forget for the same reason dispatchWebhookEvent is.
  deliverToWebhookNow(snapshot.orgId, config.webhookId, webhookEvent, webhookPayload);
}

interface ScenarioActionRow {
  type: ScenarioActionType;
  config: unknown;
}

export async function executeScenarioAction(
  action: ScenarioActionRow,
  snapshot: DocumentSnapshot,
  webhookEvent: WebhookEvent,
  webhookPayload: Record<string, unknown>,
): Promise<void> {
  try {
    switch (action.type) {
      case "CREATE_RELATED_DOCUMENT":
        await executeCreateRelatedDocument(action.config as CreateRelatedDocumentConfig, snapshot);
        break;
      case "CREATE_NOTIFICATION":
        await executeCreateNotification(action.config as CreateNotificationConfig, snapshot);
        break;
      case "SEND_WEBHOOK":
        executeSendWebhook(action.config as SendWebhookConfig, snapshot, webhookEvent, webhookPayload);
        break;
    }
  } catch (err) {
    // One broken action config must not stop the rest of the chain, nor
    // bubble up into evaluateScenarios (which itself never throws — see
    // notifyDocumentEvent's comment).
    console.error(`[scenarios] action ${action.type} failed:`, err);
  }
}
