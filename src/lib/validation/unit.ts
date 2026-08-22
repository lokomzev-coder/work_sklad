import { z } from "zod";

export const unitSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(50),
  shortName: z.string().trim().min(1, "Введите сокращение").max(20),
});

export type UnitInput = z.infer<typeof unitSchema>;
