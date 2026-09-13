/**
 * Pure, client-safe EAN-13 helpers — deliberately NOT importing lib/prisma
 * (Node-only), since template-label-renderer.tsx (a "use client" component)
 * imports `isValidEan13` from here. The DB-backed generator
 * (`generateEan13`) lives in lib/barcode-generate.ts specifically so this
 * file can stay importable from client components without pulling `pg`
 * into the browser bundle.
 */

/** GS1 reserves 200-299 for internal/in-store use (not globally unique) —
 * the right choice for barcodes this app invents on an org's behalf, as
 * opposed to a real GS1-issued prefix this project has no claim to. */
export const INTERNAL_PREFIX = "20";
export const SEQUENCE_LENGTH = 10;

/** Standard EAN-13 check digit: weight 1/3 alternating from the FIRST of
 * the 12 base digits (position 1 weight 1, position 2 weight 3, ...). */
export function ean13CheckDigit(base12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = Number(base12[i]);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false;
  return ean13CheckDigit(code.slice(0, 12)) === code[12];
}
