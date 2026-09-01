"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const groupSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(120),
});

/** Block I2.1 — departments are an org-structure concern, gated the same way
 * as Employee CRUD rather than getting their own Resource: they have no
 * view/create/edit/delete matrix of their own, just a flat name list. */
export async function createGroup(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult & { groupId?: string; name?: string }> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");

  const parsed = groupSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  let group: { id: string; name: string };
  try {
    group = await prisma.group.create({ data: { ...parsed.data, orgId: ctx.orgId } });
  } catch {
    return { error: "Такой отдел уже существует" };
  }

  revalidatePath(`/${orgSlug}/settings/groups`);
  revalidatePath(`/${orgSlug}/employees`);
  return { groupId: group.id, name: group.name };
}

export async function archiveGroup(orgSlug: string, groupId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");

  await prisma.group.update({
    where: { id: groupId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/settings/groups`);
}

export async function restoreGroup(orgSlug: string, groupId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "employees", "edit");

  await prisma.group.update({
    where: { id: groupId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/settings/groups`);
}
