import { z } from "zod";

export const storeSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(200),
  address: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || undefined),
});

export type StoreInput = z.infer<typeof storeSchema>;
