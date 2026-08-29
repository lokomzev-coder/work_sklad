import { z } from "zod";

export const clientAddressSchema = z.object({
  label: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  address: z.string().trim().min(1, "Введите адрес").max(300),
});

export type ClientAddressInput = z.infer<typeof clientAddressSchema>;
