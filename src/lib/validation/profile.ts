import { z } from "zod";

export const updateOwnProfileSchema = z.object({
  name: z.string().trim().min(1, "Введите имя").max(120),
  email: z.email("Некорректный email"),
});

export const changeOwnPasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: z.string().min(8, "Минимум 8 символов").max(200),
});

/** Block I2.4 — self-service document defaults, both nullable (either can be
 * cleared back to "not set", which falls back to the org-wide default). */
export const updateOwnDefaultsSchema = z.object({
  defaultStoreId: z.string().min(1).nullable().optional(),
  defaultLegalEntityId: z.string().min(1).nullable().optional(),
  // Block M4 phase B — same checkbox-to-FormData convention as isDefault on
  // legal-entity-form.tsx/price-type-form.tsx: absent (unchecked) becomes
  // `null` from formData.get, which z.coerce.boolean() correctly reads as
  // false.
  openPdfInBrowser: z.coerce.boolean().optional(),
});
