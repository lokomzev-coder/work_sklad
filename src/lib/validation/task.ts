import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Введите название").max(200),
  description: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  dueDate: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  assignedEmployeeId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export type TaskInput = z.infer<typeof taskSchema>;
