import { z } from "zod";

export const discountSchema = z
  .object({
    name: z.string().trim().min(1, "Введите название").max(150),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"], "Выберите тип скидки"),
    value: z.coerce.number("Укажите размер скидки").positive("Размер скидки должен быть больше 0"),
    target: z.enum(["ALL", "CATALOG_GROUP", "CATALOG_ITEM", "CLIENT"]).default("ALL"),
    targetId: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined),
    startDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined),
    endDate: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || undefined),
    isActive: z.coerce.boolean().optional().default(true),
  })
  .refine((data) => data.target === "ALL" || !!data.targetId, {
    message: "Выберите, на что действует скидка",
    path: ["targetId"],
  })
  .refine((data) => data.type !== "PERCENTAGE" || data.value <= 100, {
    message: "Процентная скидка не может превышать 100%",
    path: ["value"],
  });

export type DiscountInput = z.infer<typeof discountSchema>;
