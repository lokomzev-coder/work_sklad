import { z } from "zod";

export const contractSchema = z.object({
  number: z.string().trim().min(1, "Введите номер").max(100),
  clientId: z.string().min(1, "Выберите контрагента"),
  signedAt: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export type ContractInput = z.infer<typeof contractSchema>;
