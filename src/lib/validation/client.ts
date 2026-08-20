import { z } from "zod";

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Введите название/имя").max(200),
  inn: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => v || undefined),
  email: z
    .union([z.email("Некорректный email"), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  phone: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((v) => v || undefined),
});

export type ClientInput = z.infer<typeof clientSchema>;
