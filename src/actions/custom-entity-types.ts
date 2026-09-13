"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

export async function createCustomEntityType(orgSlug: string, name: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "create");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Введите название" };

  try {
    await prisma.customEntityType.create({ data: { orgId: ctx.orgId, name: trimmed } });
  } catch {
    return { error: "Справочник с таким названием уже есть" };
  }

  revalidatePath(`/${orgSlug}/settings/custom-entities`);
  return {};
}

export async function deleteCustomEntityType(orgSlug: string, id: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "delete");

  const inUse = await prisma.customFieldDefinition.count({ where: { customEntityTypeId: id, orgId: ctx.orgId } });
  if (inUse > 0) {
    return { error: "Справочник используется в доп. полях — сначала удалите или измените их" };
  }

  await prisma.customEntityType.delete({ where: { id, orgId: ctx.orgId } });
  revalidatePath(`/${orgSlug}/settings/custom-entities`);
  return {};
}

export async function createCustomEntityValue(orgSlug: string, customEntityTypeId: string, name: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "create");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Введите значение" };

  const dict = await prisma.customEntityType.findFirst({ where: { id: customEntityTypeId, orgId: ctx.orgId } });
  if (!dict) return { error: "Справочник не найден" };

  const count = await prisma.customEntityValue.count({ where: { customEntityTypeId } });
  try {
    await prisma.customEntityValue.create({ data: { customEntityTypeId, name: trimmed, position: count } });
  } catch {
    return { error: "Такое значение уже есть в справочнике" };
  }

  revalidatePath(`/${orgSlug}/settings/custom-entities`);
  return {};
}

export async function deleteCustomEntityValue(orgSlug: string, id: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customFields", "delete");

  const value = await prisma.customEntityValue.findFirst({
    where: { id, customEntityType: { orgId: ctx.orgId } },
  });
  if (!value) return { error: "Значение не найдено" };

  await prisma.customEntityValue.delete({ where: { id } });
  revalidatePath(`/${orgSlug}/settings/custom-entities`);
  return {};
}
