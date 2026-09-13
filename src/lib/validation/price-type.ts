import { z } from "zod";

export const priceTypeSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(100),
  isDefault: z.coerce.boolean().optional().default(false),
});

export type PriceTypeInput = z.infer<typeof priceTypeSchema>;
