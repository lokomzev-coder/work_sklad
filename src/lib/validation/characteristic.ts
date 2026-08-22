import { z } from "zod";

export const characteristicSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(50),
});

export type CharacteristicInput = z.infer<typeof characteristicSchema>;
