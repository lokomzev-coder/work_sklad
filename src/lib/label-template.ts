import { z } from "zod";

/** The fields a "field" element can bind to — deliberately a small v1 set
 * (name/sku/price/barcode-as-text); packaging-specific fields are left out
 * on purpose (can be added as a static text element, or as a real field
 * type in a later request — see ROADMAP.md's scope note). */
export const LABEL_FIELD_KEYS = ["name", "sku", "price", "barcode"] as const;
export type LabelFieldKey = (typeof LABEL_FIELD_KEYS)[number];

export const LABEL_FIELD_LABELS: Record<LabelFieldKey, string> = {
  name: "Название",
  sku: "Артикул",
  price: "Цена",
  barcode: "Штрихкод (текст)",
};

export type LabelElementType = "text" | "field" | "barcode";

export interface LabelElement {
  id: string;
  type: LabelElementType;
  /** Only for type "field" (which of the item's own values to show) — type
   * "barcode" always uses the item's barcode value, rendered graphically
   * rather than as this same text. */
  field?: LabelFieldKey;
  /** Only for type "text" — a fixed string the designer typed in. */
  text?: string;
  /** mm, from the label's top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold?: boolean;
}

const labelElementSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["text", "field", "barcode"]),
  field: z.enum(LABEL_FIELD_KEYS).optional(),
  text: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fontSize: z.number().positive(),
  bold: z.boolean().optional(),
});

export const labelTemplateInputSchema = z.object({
  name: z.string().trim().min(1, "Введите название шаблона").max(100),
  widthMm: z.coerce.number().int().positive().max(500),
  heightMm: z.coerce.number().int().positive().max(500),
  elements: z.array(labelElementSchema).max(50),
});

export type LabelTemplateInput = z.infer<typeof labelTemplateInputSchema>;

/** Prisma stores `elements` as plain `Json` — this re-validates on read so
 * a template written before a future shape change (or edited directly in
 * the DB) can't crash the renderer; invalid/unknown elements are dropped
 * rather than failing the whole page. */
export function parseLabelElements(raw: unknown): LabelElement[] {
  const parsed = z.array(labelElementSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

export const SAMPLE_LABEL_VALUES: Record<LabelFieldKey, string> = {
  name: "Образец товара",
  sku: "ART-001",
  price: "100.00 ₽",
  barcode: "2000000000008",
};
