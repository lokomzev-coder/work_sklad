import type { FiscalConfig } from "@/lib/fiscal/credentials";
import type { TaxRateType } from "@/generated/prisma/enums";

// Block E: ATOL Online v4 REST client. Shape confirmed structurally against
// several independent public sources (Habr, the retailcrm/lamoda PHP
// clients' documented usage) — getToken → sell/sellRefund → poll
// report/{uuid}. Some field values below (payment_method/payment_object/
// vat.type codes) are best-known-correct but NOT verified against the
// official protocol PDF (fetch attempts during research were blocked/failed
// to render) — see docs/handbook/retail-integrations/atol-fiscalization.md,
// which repeats this caveat. Verify before relying on this in production.
const BASE_URL = "https://online.atol.ru/possystem/v4";

interface AtolTokenResponse {
  token?: string;
  error?: { code: number; text: string };
}

export interface AtolReceiptItem {
  name: string;
  price: number;
  quantity: number;
  sum: number;
  measurementUnit: string;
  /** Block O phase 2 — the item's own CatalogItem.taxRate, resolved to
   * ATOL's vat.type per line (real per-item VAT, closes the gap flagged in
   * docs/handbook/retail-integrations/atol-fiscalization.md — this used to
   * be a single hardcoded "none" for the whole receipt). */
  taxRate: TaxRateType;
}

export interface AtolReceiptInput {
  externalId: string;
  items: AtolReceiptItem[];
  total: number;
  clientEmail?: string;
  paymentMethod: "CASH" | "CARD";
}

interface AtolSellResponse {
  uuid?: string;
  status?: string;
  error?: { code: number; text: string };
  timestamp?: string;
}

interface AtolReportResponse {
  uuid?: string;
  status?: "wait" | "done" | "fail";
  payload?: Record<string, unknown>;
  error?: { code: number; text: string };
}

// TODO: verify against the official ATOL Online v4/v5 protocol PDF before
// production use — 1 (cash) / 2 (electronic/card) are the widely-cited
// values, but not confirmed against ATOL's own document in this session.
const PAYMENT_TYPE: Record<"CASH" | "CARD", number> = { CASH: 1, CARD: 2 };
// "commodity" (goods) — same verification caveat.
const PAYMENT_OBJECT = "commodity";
// "full_payment" — paid in full at the moment of sale, no prepayment/credit.
const PAYMENT_METHOD = "full_payment";
// TODO: verify against the official ATOL Online v4/v5 protocol PDF before
// production use — same caveat as PAYMENT_TYPE/PAYMENT_OBJECT above. Values
// per widely-cited public documentation (post-2019 20%/10% rate set).
const VAT_TYPE_MAP: Record<TaxRateType, string> = {
  NONE: "none",
  VAT_0: "vat0",
  VAT_10: "vat10",
  VAT_20: "vat20",
  VAT_10_110: "vat110",
  VAT_20_120: "vat120",
};

export class AtolOnlineProvider {
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private config: FiscalConfig) {}

  private async getToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    const res = await fetch(`${BASE_URL}/getToken`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login: this.config.login, pass: this.config.password }),
    });
    const data = (await res.json()) as AtolTokenResponse;
    if (!data.token) {
      throw new Error(data.error?.text ?? "АТОЛ: не удалось получить токен");
    }

    // ~24h per researched docs — cached in-memory only, so a fresh
    // serverless invocation re-fetches; acceptable, getToken is cheap.
    this.tokenCache = { token: data.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
    return data.token;
  }

  private buildReceiptBody(receipt: AtolReceiptInput) {
    return {
      external_id: receipt.externalId,
      receipt: {
        client: receipt.clientEmail ? { email: receipt.clientEmail } : undefined,
        company: {
          email: receipt.clientEmail ?? "noreply@example.com",
          sno: this.config.sno,
          inn: this.config.inn,
          payment_address: this.config.paymentAddress,
        },
        items: receipt.items.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          sum: item.sum,
          measurement_unit: item.measurementUnit,
          payment_method: PAYMENT_METHOD,
          payment_object: PAYMENT_OBJECT,
          vat: { type: VAT_TYPE_MAP[item.taxRate] },
        })),
        payments: [{ type: PAYMENT_TYPE[receipt.paymentMethod], sum: receipt.total }],
        total: receipt.total,
      },
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
    };
  }

  private async register(
    endpoint: "sell" | "sellRefund",
    receipt: AtolReceiptInput,
  ): Promise<{ uuid: string; requestPayload: unknown } | { error: string; requestPayload: unknown }> {
    const token = await this.getToken();
    const body = this.buildReceiptBody(receipt);

    const res = await fetch(`${BASE_URL}/${this.config.groupCode}/${endpoint}?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as AtolSellResponse;

    if (!data.uuid) {
      return { error: data.error?.text ?? "АТОЛ: регистрация чека не удалась", requestPayload: body };
    }
    return { uuid: data.uuid, requestPayload: body };
  }

  registerSale(receipt: AtolReceiptInput) {
    return this.register("sell", receipt);
  }

  registerReturn(receipt: AtolReceiptInput) {
    return this.register("sellRefund", receipt);
  }

  async checkStatus(uuid: string): Promise<{ status: "PENDING" | "REGISTERED" | "FAILED"; responsePayload: unknown; error?: string }> {
    const token = await this.getToken();
    const res = await fetch(`${BASE_URL}/${this.config.groupCode}/report/${uuid}?token=${token}`);
    const data = (await res.json()) as AtolReportResponse;

    if (data.status === "done") return { status: "REGISTERED", responsePayload: data };
    if (data.status === "fail") return { status: "FAILED", responsePayload: data, error: data.error?.text };
    return { status: "PENDING", responsePayload: data };
  }
}
