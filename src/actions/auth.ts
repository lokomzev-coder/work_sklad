"use server";

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signIn, signOut } from "@/lib/auth";
import { registerSchema, loginSchema } from "@/lib/validation/auth";
import { slugify } from "@/lib/slug";
import { generateDek, wrapDek } from "@/lib/crypto";

export interface ActionResult {
  error?: string;
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let attempt = 0;
  while (await prisma.organization.findUnique({ where: { slug } })) {
    attempt += 1;
    slug = `${base}-${attempt}`;
  }
  return slug;
}

export async function registerAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    orgName: formData.get("orgName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const { name, email, password, orgName } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Пользователь с таким email уже существует" };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = await uniqueSlug(slugify(orgName));

  // Every org gets its own password-vault encryption key from the start,
  // wrapped by the app master key -- see lib/crypto.ts.
  const dek = generateDek();
  const { wrapped, nonce } = wrapDek(dek);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email, passwordHash },
    });
    const org = await tx.organization.create({
      data: { name: orgName, slug, encDekWrapped: wrapped, encDekNonce: nonce },
    });
    await tx.membership.create({
      data: { userId: user.id, orgId: org.id, role: "ADMIN" },
    });
  });

  await signIn("credentials", { email, password, redirectTo: `/${slug}` });
  return {};
}

export async function loginAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "CredentialsSignin") {
      return { error: "Неверный email или пароль" };
    }
    throw err;
  }

  return {};
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
