import { z } from "zod";

export const catalogItemSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(200),
  type: z.enum(["PRODUCT", "SERVICE"], "Выберите тип"),
  sku: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  unitPrice: z.coerce
    .number("Укажите цену")
    .min(0, "Цена не может быть отрицательной"),
  currency: z.string().trim().min(1).max(10).default("RUB"),
});

export type CatalogItemInput = z.infer<typeof catalogItemSchema>;
