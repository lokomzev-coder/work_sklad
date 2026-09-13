import { prisma } from "@/lib/prisma";
import { getFiscalConfig } from "@/lib/fiscal/credentials";
import { AtolOnlineProvider, type AtolReceiptInput } from "@/lib/fiscal/atol-provider";
import type { FiscalDocumentType, TaxRateType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export interface FiscalReceiptRequest {
  documentType: FiscalDocumentType;
  documentId: string;
  retailSaleId?: string;
  externalId: string;
  items: { name: string; price: number; quantity: number; sum: number; measurementUnit: string; taxRate: TaxRateType }[];
  total: number;
  clientEmail?: string;
  paymentMethod: "CASH" | "CARD";
}

/**
 * Block E: fires after a retail sale/return commits — never awaited by the
 * checkout action (mirrors dispatchWebhookEvent's fire-and-forget pattern,
 * see lib/scenarios.ts) so a slow/unreachable ОФД never stalls checkout.
 * If the org hasn't configured fiscal settings, this is a silent no-op —
 * fiscalization is opt-in, never a blocker. Every internal error is caught
 * so a broken ОФД integration can never surface as a checkout failure.
 */
export function registerFiscalReceipt(orgId: string, request: FiscalReceiptRequest): void {
  void (async () => {
    try {
      const config = await getFiscalConfig(orgId);
      if (!config) return; // fiscalization not configured for this org — nothing to do

      const receiptRow = await prisma.fiscalReceipt.create({
        data: {
          orgId,
          documentType: request.documentType,
          documentId: request.documentId,
          retailSaleId: request.retailSaleId,
          status: "PENDING",
        },
      });

      const provider = new AtolOnlineProvider(config);
      const input: AtolReceiptInput = {
        externalId: request.externalId,
        items: request.items,
        total: request.total,
        clientEmail: request.clientEmail,
        paymentMethod: request.paymentMethod,
      };

      const result =
        request.documentType === "RETAIL_SALE" ? await provider.registerSale(input) : await provider.registerReturn(input);

      if ("error" in result) {
        await prisma.fiscalReceipt.update({
          where: { id: receiptRow.id },
          data: {
            status: "FAILED",
            error: result.error,
            requestPayload: result.requestPayload as Prisma.InputJsonValue,
          },
        });
        return;
      }

      await prisma.fiscalReceipt.update({
        where: { id: receiptRow.id },
        data: { atolUuid: result.uuid, requestPayload: result.requestPayload as Prisma.InputJsonValue },
      });
    } catch (err) {
      console.error(`[fiscal] registerFiscalReceipt failed for ${request.documentType} ${request.documentId}:`, err);
    }
  })();
}

const POLL_BATCH_SIZE = 50;

export interface FiscalPollResult {
  attempted: number;
  registered: number;
  failed: number;
  stillPending: number;
}

/**
 * Block E: driven by GET /api/cron/fiscal-status on whatever schedule an
 * external scheduler hits it with — same "no in-process background-job
 * infra" situation as Block M3's webhook retries (see that route's
 * comment). Polls every PENDING FiscalReceipt that already has an
 * atolUuid (i.e. registration was accepted, just not yet confirmed).
 */
export async function pollPendingFiscalReceipts(): Promise<FiscalPollResult> {
  const pending = await prisma.fiscalReceipt.findMany({
    where: { status: "PENDING", atolUuid: { not: null } },
    take: POLL_BATCH_SIZE,
    orderBy: { createdAt: "asc" },
    include: { org: { select: { fiscalProvider: true, fiscalGroupCode: true, fiscalInn: true, fiscalPaymentAddress: true, fiscalSno: true } } },
  });

  let registered = 0;
  let failed = 0;
  let stillPending = 0;

  await Promise.allSettled(
    pending.map(async (receipt) => {
      try {
        const config = await getFiscalConfig(receipt.orgId);
        if (!config) return; // fiscalization was disabled after this receipt was created — leave as-is
        const provider = new AtolOnlineProvider(config);
        const result = await provider.checkStatus(receipt.atolUuid!);

        if (result.status === "PENDING") {
          stillPending++;
          return;
        }
        await prisma.fiscalReceipt.update({
          where: { id: receipt.id },
          data: {
            status: result.status,
            error: result.error,
            responsePayload: result.responsePayload as Prisma.InputJsonValue,
          },
        });
        if (result.status === "REGISTERED") registered++;
        else failed++;
      } catch (err) {
        console.error(`[fiscal] status poll failed for receipt ${receipt.id}:`, err);
      }
    }),
  );

  return { attempted: pending.length, registered, failed, stillPending };
}
