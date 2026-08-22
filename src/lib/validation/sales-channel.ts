import { z } from "zod";

export const salesChannelSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(100),
});

export type SalesChannelInput = z.infer<typeof salesChannelSchema>;
