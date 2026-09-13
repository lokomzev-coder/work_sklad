import type { PaymentTerminalAdapter, PaymentTerminalResult } from "@/lib/terminal/payment-terminal-adapter";

/**
 * Block E v1: no real terminal hardware/protocol available to build or test
 * against (see docs/handbook/retail-integrations/card-terminal.md) — the
 * cashier confirms a card payment manually in the POS UI ("Оплата картой
 * получена" / "Отменить") BEFORE `checkoutSale` is ever called, so by the
 * time this adapter runs server-side the confirmation has already happened
 * client-side. This implementation is therefore a trivial always-succeeds
 * stub, not a real hardware round-trip — it exists so the call site
 * (`actions/retail-sales.ts`) already goes through the same
 * `PaymentTerminalAdapter` interface a real driver would use, and doesn't
 * need to change when one is wired up later.
 */
export class ManualConfirmationAdapter implements PaymentTerminalAdapter {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature fixed by the PaymentTerminalAdapter interface
  async requestPayment(amountRub: number): Promise<PaymentTerminalResult> {
    return { success: true };
  }
}
