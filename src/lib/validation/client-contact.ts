import { z } from "zod";

export const clientContactSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(150),
  position: z
    .string()
    .trim()
    .max(150)
    .optional()
    .transform((v) => v || undefined),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => v || undefined),
  email: z
    .union([z.email("Некорректный email"), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
});

export type ClientContactInput = z.infer<typeof clientContactSchema>;
