/** Pure data, no Prisma import — safe to use from Client Components, same
 * reasoning as stock-labels.ts. */
export const TAX_RATE_LABELS: Record<string, string> = {
  NONE: "Без НДС",
  VAT_0: "НДС 0%",
  VAT_10: "НДС 10%",
  VAT_20: "НДС 20%",
  VAT_10_110: "НДС 10/110 (включён в цену)",
  VAT_20_120: "НДС 20/120 (включён в цену)",
};
