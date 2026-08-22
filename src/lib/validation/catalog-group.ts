import { z } from "zod";

export const catalogGroupSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(100),
  parentId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export type CatalogGroupInput = z.infer<typeof catalogGroupSchema>;
