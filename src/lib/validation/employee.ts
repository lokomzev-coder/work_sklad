import { z } from "zod";

export const employeeSchema = z.object({
  fullName: z.string().trim().min(1, "Введите имя").max(200),
  position: z
    .string()
    .trim()
    .max(200)
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
  defaultStoreId: z.string().min(1).nullable().optional(),
  groupId: z.string().min(1).nullable().optional(),
});

export type EmployeeInput = z.infer<typeof employeeSchema>;
