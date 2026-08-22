import { z } from "zod";

// Latin letters/digits, optionally with . _ - in the middle — no spaces, no
// "@" (that's the separator from the org slug), no leading/trailing symbol.
const LOGIN_REGEX = /^[a-z0-9](?:[a-z0-9._-]{0,48}[a-z0-9])?$/;

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(120),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(LOGIN_REGEX, "Логин: латиница/цифры, без пробелов и @"),
  email: z.email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").max(200),
  orgName: z.string().trim().min(1, "Введите название организации").max(120),
});

export const loginSchema = z.object({
  // "login@orgSlug" — the org half is parsed server-side (lib/auth.ts), not
  // a real email; validated as a shape here, not resolved to anything yet.
  loginId: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => {
      const at = v.lastIndexOf("@");
      return at > 0 && at < v.length - 1;
    }, "Введите логин в формате login@организация"),
  password: z.string().min(1, "Введите пароль"),
});
