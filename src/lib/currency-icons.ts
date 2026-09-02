import {
  RussianRuble,
  DollarSign,
  Euro,
  PoundSterling,
  JapaneseYen,
  SwissFranc,
  Coins,
  type LucideIcon,
} from "lucide-react";

// Block H5: `currency` is a free-form string (settings/currencies), not
// ISO-4217-validated — see lib/format.ts's own comment on the same issue.
// Unrecognized codes fall back to a generic Coins icon rather than always
// defaulting to DollarSign, which was misleading for non-USD orgs.
const CURRENCY_ICONS: Record<string, LucideIcon> = {
  RUB: RussianRuble,
  USD: DollarSign,
  EUR: Euro,
  GBP: PoundSterling,
  JPY: JapaneseYen,
  CHF: SwissFranc,
};

export function getCurrencyIcon(currency: string): LucideIcon {
  return CURRENCY_ICONS[currency.toUpperCase()] ?? Coins;
}
