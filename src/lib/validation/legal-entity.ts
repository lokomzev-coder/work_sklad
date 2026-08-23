import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

export const legalEntitySchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(200),
  inn: optionalText(20),
  kpp: optionalText(20),
  ogrn: optionalText(20),
  address: optionalText(300),
  bankName: optionalText(200),
  bankBik: optionalText(20),
  bankAccount: optionalText(30),
  isDefault: z.coerce.boolean().optional(),
});

export type LegalEntityInput = z.infer<typeof legalEntitySchema>;
