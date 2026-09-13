// Block E: a browser cannot talk to a USB/COM-port card terminal directly —
// real integrations run through a local bridge on the till PC. This
// interface is the seam between checkout logic and whatever actually
// requests payment from the terminal, so `manual-confirmation-adapter.ts`
// (v1, no hardware) and a future real driver (see
// `inpas-smartsale-adapter.ts` and docs/handbook/retail-integrations/
// card-terminal.md) are interchangeable without touching actions/
// retail-sales.ts.
export interface PaymentTerminalResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentTerminalAdapter {
  requestPayment(amountRub: number): Promise<PaymentTerminalResult>;
}
