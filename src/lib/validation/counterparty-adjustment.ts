import { z } from "zod";

export const counterpartyAdjustmentSchema = z.object({
  side: z.enum(["RECEIVABLE", "PAYABLE"], "Выберите баланс"),
  amount: z.coerce.number("Укажите сумму").positive("Сумма должна быть больше 0"),
  comment: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export type CounterpartyAdjustmentInput = z.infer<typeof counterpartyAdjustmentSchema>;
