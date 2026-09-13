import type { PrismaClient } from "@/generated/prisma/client";
import { getCurrentAuditActor } from "@/lib/audit-context";
import { toJsonSafe } from "@/lib/json-safe";

/**
 * Block O phase 3 — the fixed set of models this audit log covers. Matches
 * the "real business document" set already agreed on in phase 1's public
 * API registry (lib/api-registry.ts), minus CatalogItemVariant (no direct
 * orgId, high-churn/fine-grained — auditing its parent CatalogItem is
 * enough). Deliberately NOT every model: high-volume system-generated rows
 * (Notification, WebhookDelivery, StockBatchAllocation, ...) would just be
 * noise in a log meant to answer "who changed this business record."
 */
const AUDITED_MODELS = new Set([
  "Client", "Employee", "Store", "Contract", "Project", "SalesChannel",
  "LegalEntity", "CatalogItem", "Order", "PurchaseOrder", "StockMovement",
  "Payment", "InvoiceOut", "InvoiceIn",
]);

const AUDITED_OPERATIONS = new Set(["create", "update", "delete"]);

function delegateKey(model: string): string {
  return model[0].toLowerCase() + model.slice(1);
}

function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const beforeSafe = toJsonSafe(before);
  const afterSafe = toJsonSafe(after);
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(afterSafe)) {
    if (JSON.stringify(beforeSafe[key]) !== JSON.stringify(afterSafe[key])) {
      diff[key] = { from: beforeSafe[key] ?? null, to: afterSafe[key] ?? null };
    }
  }
  return diff;
}

/**
 * Builds the `query` component of a Prisma Client Extension — wraps
 * create/update/delete on AUDITED_MODELS to transparently write an
 * AuditLog row, without any of the ~50 existing Server Actions (or the new
 * API routes) having to call anything themselves. `base` is the
 * *unextended* client, used for the before-state read (update/delete) and
 * the AuditLog write itself — using the extended client for either would
 * needlessly run this same logic recursively (AuditLog isn't in
 * AUDITED_MODELS, so it's harmless either way, but `base` is cheaper and
 * makes the non-recursion obvious).
 */
export function createAuditLogExtension(base: PrismaClient) {
  return {
    name: "audit-log",
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model?: string;
          operation: string;
          args: Record<string, unknown>;
          query: (args: Record<string, unknown>) => Promise<unknown>;
        }) {
          if (!model || !AUDITED_MODELS.has(model) || !AUDITED_OPERATIONS.has(operation)) {
            return query(args);
          }
          const actor = getCurrentAuditActor();
          if (!actor) return query(args);

          const delegate = (base as unknown as Record<string, { findUnique(args: unknown): Promise<Record<string, unknown> | null> }>)[
            delegateKey(model)
          ];

          if (operation === "create") {
            const result = (await query(args)) as Record<string, unknown>;
            await writeAuditLog(base, actor, model, "CREATE", String(result.id), toJsonSafe(result));
            return result;
          }

          if (operation === "update") {
            const before = await delegate.findUnique({ where: args.where });
            const result = (await query(args)) as Record<string, unknown>;
            if (before) {
              const diff = computeDiff(before, result);
              if (Object.keys(diff).length > 0) {
                await writeAuditLog(base, actor, model, "UPDATE", String(result.id), diff);
              }
            }
            return result;
          }

          // delete
          const before = await delegate.findUnique({ where: args.where });
          const result = await query(args);
          if (before) {
            await writeAuditLog(base, actor, model, "DELETE", String(before.id), toJsonSafe(before));
          }
          return result;
        },
      },
    },
  };
}

async function writeAuditLog(
  base: PrismaClient,
  actor: { orgId: string; source: "UI" | "API"; userId?: string; label: string },
  entityType: string,
  action: "CREATE" | "UPDATE" | "DELETE",
  entityId: string,
  diff: unknown,
): Promise<void> {
  try {
    await base.auditLog.create({
      data: {
        orgId: actor.orgId,
        entityType,
        entityId,
        action,
        source: actor.source,
        actorUserId: actor.userId,
        actorLabel: actor.label,
        diff: diff as never,
      },
    });
  } catch (err) {
    // An audit-log write must never break the actual business mutation it's
    // describing — log and move on, same "never let a side-channel failure
    // surface as a user-facing error" principle as registerFiscalReceipt/
    // dispatchWebhookEvent.
    console.error("[audit-log] failed to write entry", err);
  }
}
