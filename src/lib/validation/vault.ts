import { z } from "zod";

export const vaultEntrySchema = z.object({
  serviceName: z.string().trim().min(1, "Введите название сервиса").max(200),
  url: z
    .union([z.url("Некорректный адрес"), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
  username: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => v || undefined),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => v || undefined),
});

export type VaultEntryInput = z.infer<typeof vaultEntrySchema>;
