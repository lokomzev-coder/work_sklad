import { prisma } from "@/lib/prisma";
import { dispatchWebhookEvent } from "@/lib/webhooks";
import { executeScenarioAction } from "@/lib/scenario-actions";
import type { WebhookEvent } from "@/generated/prisma/enums";
import type {
  ScenarioDocumentType,
  ScenarioEventType,
  ScenarioConditionField,
  ScenarioConditionOperator,
} from "@/generated/prisma/enums";

// Only the fields that actually exist across all 5 v1 document types — see
// the ScenarioConditionField schema comment. null means "this field doesn't
// apply to this document type", not "unknown"; evaluateConditions treats a
// null field as "condition not met", never throws.
export interface DocumentSnapshot {
  orgId: string;
  documentType: ScenarioDocumentType;
  id: string;
  statusId: string;
  counterpartyId: string | null;
  assignedEmployeeId: string | null;
  total: number | null;
  quantity: number | null;
}

function sumLineItems(lines: { quantity: unknown; unitPriceSnapshot: unknown }[]): number {
  return lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPriceSnapshot), 0);
}

async function buildDocumentSnapshot(
  orgId: string,
  documentType: ScenarioDocumentType,
  documentId: string,
): Promise<DocumentSnapshot | null> {
  switch (documentType) {
    case "ORDER": {
      const order = await prisma.order.findFirst({
        where: { id: documentId, orgId },
        select: { statusId: true, clientId: true, assignedEmployeeId: true, lineItems: { select: { quantity: true, unitPriceSnapshot: true } } },
      });
      if (!order) return null;
      return {
        orgId, documentType, id: documentId,
        statusId: order.statusId,
        counterpartyId: order.clientId,
        assignedEmployeeId: order.assignedEmployeeId,
        total: sumLineItems(order.lineItems),
        quantity: null,
      };
    }
    case "PURCHASE_ORDER": {
      const po = await prisma.purchaseOrder.findFirst({
        where: { id: documentId, orgId },
        select: { statusId: true, supplierId: true, assignedEmployeeId: true, lineItems: { select: { quantity: true, unitPriceSnapshot: true } } },
      });
      if (!po) return null;
      return {
        orgId, documentType, id: documentId,
        statusId: po.statusId,
        counterpartyId: po.supplierId,
        assignedEmployeeId: po.assignedEmployeeId,
        total: sumLineItems(po.lineItems),
        quantity: null,
      };
    }
    case "INVOICE_OUT": {
      const invoice = await prisma.invoiceOut.findFirst({
        where: { id: documentId, orgId },
        select: { statusId: true, clientId: true, lineItems: { select: { quantity: true, unitPriceSnapshot: true } } },
      });
      if (!invoice) return null;
      return {
        orgId, documentType, id: documentId,
        statusId: invoice.statusId,
        counterpartyId: invoice.clientId,
        assignedEmployeeId: null, // InvoiceOut has no assignedEmployeeId field at all
        total: sumLineItems(invoice.lineItems),
        quantity: null,
      };
    }
    case "INVOICE_IN": {
      const invoice = await prisma.invoiceIn.findFirst({
        where: { id: documentId, orgId },
        select: { statusId: true, supplierId: true, lineItems: { select: { quantity: true, unitPriceSnapshot: true } } },
      });
      if (!invoice) return null;
      return {
        orgId, documentType, id: documentId,
        statusId: invoice.statusId,
        counterpartyId: invoice.supplierId,
        assignedEmployeeId: null, // InvoiceIn has no assignedEmployeeId field at all
        total: sumLineItems(invoice.lineItems),
        quantity: null,
      };
    }
    case "PRODUCTION_ORDER": {
      const po = await prisma.productionOrder.findFirst({
        where: { id: documentId, orgId },
        select: { statusId: true, assignedEmployeeId: true, quantity: true },
      });
      if (!po) return null;
      return {
        orgId, documentType, id: documentId,
        statusId: po.statusId,
        counterpartyId: null, // ProductionOrder has no counterparty
        assignedEmployeeId: po.assignedEmployeeId,
        total: null,
        quantity: Number(po.quantity),
      };
    }
  }
}

function evaluateOne(
  condition: { field: ScenarioConditionField; operator: ScenarioConditionOperator; value: string },
  snapshot: DocumentSnapshot,
): boolean {
  const fieldValue: string | number | null =
    condition.field === "STATUS"
      ? snapshot.statusId
      : condition.field === "COUNTERPARTY"
        ? snapshot.counterpartyId
        : condition.field === "ASSIGNED_EMPLOYEE"
          ? snapshot.assignedEmployeeId
          : condition.field === "TOTAL"
            ? snapshot.total
            : snapshot.quantity; // QUANTITY

  if (fieldValue === null) return false; // field doesn't apply to this document type

  if (typeof fieldValue === "number") {
    const compareTo = Number(condition.value);
    switch (condition.operator) {
      case "EQUALS": return fieldValue === compareTo;
      case "NOT_EQUALS": return fieldValue !== compareTo;
      case "GREATER_THAN": return fieldValue > compareTo;
      case "GREATER_OR_EQUAL": return fieldValue >= compareTo;
      case "LESS_THAN": return fieldValue < compareTo;
      case "LESS_OR_EQUAL": return fieldValue <= compareTo;
    }
  }
  // id-valued fields (STATUS/COUNTERPARTY/ASSIGNED_EMPLOYEE) only meaningfully
  // support (in)equality — GREATER_THAN etc. on a string id is nonsensical,
  // the rule editor's operator picker only offers EQUALS/NOT_EQUALS for
  // these fields, so this branch is a defensive fallback, not a real UI path.
  return condition.operator === "NOT_EQUALS" ? fieldValue !== condition.value : fieldValue === condition.value;
}

export function evaluateConditions(
  conditions: { field: ScenarioConditionField; operator: ScenarioConditionOperator; value: string }[],
  snapshot: DocumentSnapshot,
): boolean {
  return conditions.every((c) => evaluateOne(c, snapshot));
}

async function evaluateScenarios(
  orgId: string,
  documentType: ScenarioDocumentType,
  eventType: ScenarioEventType,
  documentId: string,
  webhookEvent: WebhookEvent,
  webhookPayload: Record<string, unknown>,
): Promise<void> {
  const rules = await prisma.scenarioRule.findMany({
    where: { orgId, documentType, eventType, isActive: true },
    include: { conditions: true, actions: { orderBy: { sortOrder: "asc" } } },
  });
  if (rules.length === 0) return;

  const snapshot = await buildDocumentSnapshot(orgId, documentType, documentId);
  if (!snapshot) return; // document already deleted/unreachable

  for (const rule of rules) {
    if (!evaluateConditions(rule.conditions, snapshot)) continue;
    // Sequential, in sortOrder — an action chain is defined as ordered steps,
    // not independent parallel work (e.g. "create invoice" then "notify
    // about the invoice" implies the first already happened).
    for (const action of rule.actions) {
      await executeScenarioAction(action, snapshot, webhookEvent, webhookPayload);
    }
  }
}

/**
 * Block K: the single instrumentation point every document mutation action
 * (orders.ts, purchase-orders.ts, invoices-out.ts, invoices-in.ts,
 * production-orders.ts) calls instead of dispatchWebhookEvent directly —
 * guarantees the webhook dispatch and scenario evaluation always fire
 * together, so a future new call site can't add one and forget the other.
 *
 * dispatchWebhookEvent stays fire-and-forget (an outbound HTTP call must
 * never stall the Server Action). evaluateScenarios is AWAITED here on
 * purpose — unlike a webhook, its actions (create a document, write a
 * notification) are real DB writes the user expects to see reflected
 * immediately after the action returns (e.g. right after revalidatePath).
 * It never throws outward: every internal error is caught and logged so a
 * single broken scenario rule can't break saving an order/invoice for the
 * whole organization.
 */
export function notifyDocumentEvent(
  orgId: string,
  webhookEvent: WebhookEvent,
  webhookPayload: Record<string, unknown>,
  documentType: ScenarioDocumentType,
  eventType: ScenarioEventType,
  documentId: string,
): Promise<void> {
  dispatchWebhookEvent(orgId, webhookEvent, webhookPayload);
  return evaluateScenarios(orgId, documentType, eventType, documentId, webhookEvent, webhookPayload).catch((err) => {
    console.error(`[scenarios] evaluation failed for ${documentType}/${eventType} ${documentId}:`, err);
  });
}
