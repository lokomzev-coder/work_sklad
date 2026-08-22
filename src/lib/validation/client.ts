import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Введите название/имя").max(200),
  inn: optionalText(20),
  email: z
    .union([z.email("Некорректный email"), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  phone: optionalText(50),
  address: optionalText(300),
  kpp: optionalText(20),
  ogrn: optionalText(20),
  bankName: optionalText(200),
  bankBik: optionalText(20),
  bankAccount: optionalText(30),
});

export type ClientInput = z.infer<typeof clientSchema>;
