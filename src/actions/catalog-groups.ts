"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { catalogGroupSchema } from "@/lib/validation/catalog-group";

export interface ActionResult {
  error?: string;
}

function parseGroupForm(formData: FormData) {
  const parentId = formData.get("parentId");
  return catalogGroupSchema.safeParse({
    name: formData.get("name"),
    parentId: parentId === "__none__" ? "" : parentId,
  });
}

// parentId comes from a client-controlled <select> value — confirm it
// actually belongs to this org before writing, otherwise a crafted form
// submission could link a group into another org's group tree.
async function assertParentBelongsToOrg(orgId: string, parentId: string) {
  const parent = await prisma.catalogGroup.findFirst({
    where: { id: parentId, orgId },
  });
  if (!parent) throw new Error("Родительская группа не найдена");
}

// Prevents turning a group into its own ancestor (A -> B -> A), which would
// otherwise create an infinite loop when rendering the group tree.
async function isDescendant(
  orgId: string,
  candidateParentId: string,
  groupId: string,
): Promise<boolean> {
  let current: string | null = candidateParentId;
  while (current) {
    if (current === groupId) return true;
    const parent: { parentId: string | null } | null =
      await prisma.catalogGroup.findFirst({
        where: { id: current, orgId },
        select: { parentId: true },
      });
    current = parent?.parentId ?? null;
  }
  return false;
}

export async function createCatalogGroup(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = parseGroupForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }
  if (parsed.data.parentId) {
    await assertParentBelongsToOrg(ctx.orgId, parsed.data.parentId);
  }

  await prisma.catalogGroup.create({
    data: { ...parsed.data, orgId: ctx.orgId },
  });

  revalidatePath(`/${orgSlug}/catalog/groups`);
  redirect(`/${orgSlug}/catalog/groups`);
}

export async function updateCatalogGroup(
  orgSlug: string,
  groupId: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const parsed = parseGroupForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  if (parsed.data.parentId === groupId) {
    return { error: "Группа не может быть родителем самой себе" };
  }
  if (parsed.data.parentId) {
    await assertParentBelongsToOrg(ctx.orgId, parsed.data.parentId);
    if (await isDescendant(ctx.orgId, parsed.data.parentId, groupId)) {
      return { error: "Нельзя перенести группу в собственную подгруппу" };
    }
  }

  await prisma.catalogGroup.update({
    where: { id: groupId, orgId: ctx.orgId },
    data: { ...parsed.data, parentId: parsed.data.parentId ?? null },
  });

  revalidatePath(`/${orgSlug}/catalog/groups`);
  redirect(`/${orgSlug}/catalog/groups`);
}

export async function deleteCatalogGroup(orgSlug: string, groupId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx.role, "catalog", "edit");

  const [childCount, itemCount] = await Promise.all([
    prisma.catalogGroup.count({ where: { parentId: groupId, orgId: ctx.orgId } }),
    prisma.catalogItem.count({ where: { groupId, orgId: ctx.orgId } }),
  ]);

  if (childCount > 0) {
    return { error: `Нельзя удалить: содержит ${childCount} подгрупп(у/ы)` };
  }
  if (itemCount > 0) {
    return {
      error: `Нельзя удалить: содержит ${itemCount} позици(ю/й) каталога`,
    };
  }

  await prisma.catalogGroup.delete({ where: { id: groupId, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/catalog/groups`);
  return {};
}
