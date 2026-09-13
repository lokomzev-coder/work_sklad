import { z } from "zod";

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(200),
  type: z.enum(["PRODUCT", "SERVICE", "BUNDLE"], "Выберите тип"),
  sku: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  barcode: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((v) => v || undefined),
  unitPrice: z.coerce
    .number("Укажите цену")
    .min(0, "Цена не может быть отрицательной"),
  currency: z.string().trim().min(1).max(10).default("RUB"),
  unitId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  groupId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  taxRate: z
    .enum(["NONE", "VAT_0", "VAT_10", "VAT_20", "VAT_10_110", "VAT_20_120"])
    .default("NONE"),
  minStock: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number().min(0, "Минимальный остаток не может быть отрицательным").optional(),
  ),
});

export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
