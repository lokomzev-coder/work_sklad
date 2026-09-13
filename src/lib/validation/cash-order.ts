import { z } from "zod";

export const cashOrderSchema = z.object({
  direction: z.enum(["IN", "OUT"], "Выберите направление"),
  amount: z.coerce.number("Укажите сумму").positive("Сумма должна быть больше 0"),
  counterpartyId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  expenseItemId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export type CashOrderInput = z.infer<typeof cashOrderSchema>;
