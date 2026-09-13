"use server";

import { z } from "zod";
import { adminSignIn } from "@/lib/admin-auth";
import { getAdminBasePath } from "@/lib/platform-auth";

export interface AdminActionResult {
  error?: string;
}

const adminLoginSchema = z.object({
  email: z.string().trim().min(1, "Укажите email"),
  password: z.string().min(1, "Укажите пароль"),
  totpCode: z.string().trim().regex(/^\d{6}$/, "Код должен состоять из 6 цифр"),
});

/**
 * Блок L — mirrors `actions/auth.ts::loginAction`'s error-handling shape
 * exactly (catch CredentialsSignin by name, generic message), calling
 * `adminSignIn` (lib/admin-auth.ts) instead of the org-side `signIn`. The
 * "invalid credentials" message is deliberately identical whether the
 * email doesn't exist, the password is wrong, or the TOTP code is wrong —
 * distinguishing them would tell an attacker which factor to keep
 * attacking. Rate-limiting gets its own message (not a secret-guessing
 * signal, a legitimate "slow down" notice).
 */
export async function adminLoginAction(
  _prevState: AdminActionResult,
  formData: FormData,
): Promise<AdminActionResult> {
  const parsed = adminLoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    totpCode: formData.get("totpCode"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await adminSignIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      totpCode: parsed.data.totpCode,
      redirectTo: getAdminBasePath(),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "CredentialsSignin") {
      const code = (err as Error & { code?: string }).code;
      if (code === "rate_limited") {
        return { error: "Слишком много попыток входа. Попробуйте позже." };
      }
      return { error: "Неверные email, пароль или код 2FA" };
    }
    throw err;
  }

  return {};
}
