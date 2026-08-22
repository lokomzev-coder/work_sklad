import { z } from "zod";

export const paymentSchema = z.object({
  direction: z.enum(["IN", "OUT"], "Выберите направление"),
  amount: z.coerce.number("Укажите сумму").positive("Сумма должна быть больше 0"),
  currency: z.string().trim().min(1).max(10).default("RUB"),
  counterpartyId: z.string().min(1, "Выберите контрагента"),
  orderId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  purchaseOrderId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  comment: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => v || undefined),
});

export type PaymentInput = z.infer<typeof paymentSchema>;
