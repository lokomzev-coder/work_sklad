// Block E: NOT IMPLEMENTED. Documented stub only — see
// docs/handbook/retail-integrations/card-terminal.md for the full
// explanation and what's needed to finish this for real.
//
// A browser (and this Next.js server) cannot talk to a terminal's COM/USB
// port directly. Real POS software (Frontol, 1С:Розница) runs a local
// bridge service on the till PC, which the checkout UI would call over
// `localhost` instead of calling this adapter's methods server-side. INPAS
// SmartSale (DualConnector) is the most common protocol among Russian
// acquiring banks (Т-Банк, ВТБ, Открытие, Точка confirmed supporting it),
// used with Verifone/PAX terminals over a COM port — but the exact byte
// protocol is not public; it's normally supplied by the bank when the
// terminal is installed.
//
// Sketch of the intended shape once that's available (not implemented):
export interface InpasSmartSaleConfig {
  /** COM port the terminal is attached to on the till PC, e.g. "COM3". */
  comPort: string;
  /** Terminal ID assigned by the acquiring bank. */
  terminalId: string;
}

// export class InpasSmartSaleAdapter implements PaymentTerminalAdapter {
//   constructor(private config: InpasSmartSaleConfig) {}
//   async requestPayment(amountRub: number): Promise<PaymentTerminalResult> {
//     // Would POST to the local bridge service's HTTP API (not this Next.js
//     // server — a separate process running on the till PC itself), which
//     // speaks DualConnector to the terminal over config.comPort. Needs the
//     // bank's SDK/protocol docs to implement correctly — see the handbook.
//     throw new Error("Not implemented — see docs/handbook/retail-integrations/card-terminal.md");
//   }
// }
