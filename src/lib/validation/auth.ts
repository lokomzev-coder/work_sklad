import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(120),
  email: z.email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").max(200),
  orgName: z.string().trim().min(1, "Введите название организации").max(120),
});

export const loginSchema = z.object({
  email: z.email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});
