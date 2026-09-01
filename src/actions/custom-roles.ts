"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import {
  assertPermission,
  NON_OVERRIDABLE_RESOURCES,
  type Resource,
  type ResourcePermission,
  type ScopeLevel,
  type CustomRolePermissionsV2,
} from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";

export interface ActionResult {
  error?: string;
}

const SCOPE_RANK: Record<ScopeLevel, number> = { NONE: 0, OWN: 1, OWN_GROUP: 2, ALL: 3 };

const resourcePermissionSchema = z.object({
  view: z.enum(["NONE", "OWN", "OWN_GROUP", "ALL"]),
  create: z.boolean(),
  edit: z.enum(["NONE", "OWN", "OWN_GROUP", "ALL"]),
  delete: z.boolean(),
});

const saveSchema = z.object({
  resources: z.record(z.string(), resourcePermissionSchema),
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(60),
});

/**
 * Block I2.1 delegation ceiling — the actual server-side enforcement behind
 * the matrix editor's disabled controls (that's UX only). Nobody can save a
 * role that outranks their OWN currently-resolved capabilities, and
 * NON_OVERRIDABLE_RESOURCES (membership/customRoles) are silently dropped
 * from whatever was submitted rather than saved verbatim — closes the
 * self-escalation loop even if a request bypasses the client UI entirely.
 */
function clampToCeiling(
  resources: Record<string, ResourcePermission>,
  ceiling: Record<Resource, ResourcePermission>,
  nonOverridable: ReadonlySet<Resource>,
): Partial<Record<Resource, ResourcePermission>> {
  const clamped: Partial<Record<Resource, ResourcePermission>> = {};
  for (const [key, perm] of Object.entries(resources)) {
    const resource = key as Resource;
    if (nonOverridable.has(resource)) continue;
    const cap = ceiling[resource];
    if (!cap) continue;
    clamped[resource] = {
      view: SCOPE_RANK[perm.view] <= SCOPE_RANK[cap.view] ? perm.view : cap.view,
      create: perm.create && cap.create,
      edit: SCOPE_RANK[perm.edit] <= SCOPE_RANK[cap.edit] ? perm.edit : cap.edit,
      delete: perm.delete && cap.delete,
    };
  }
  return clamped;
}

export async function createCustomRole(
  orgSlug: string,
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult & { roleId?: string }> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customRoles", "create");

  const parsed = createSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  const emptyPermissions: CustomRolePermissionsV2 = { version: 2, resources: {} };
  try {
    const role = await prisma.customRole.create({
      data: {
        orgId: ctx.orgId,
        name: parsed.data.name,
        permissions: emptyPermissions as unknown as Prisma.InputJsonValue,
      },
    });
    revalidatePath(`/${orgSlug}/settings/roles`);
    return { roleId: role.id };
  } catch {
    return { error: "Роль с таким названием уже есть" };
  }
}

export async function renameCustomRole(orgSlug: string, roleId: string, name: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customRoles", "edit");

  const parsed = createSchema.safeParse({ name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.customRole.update({
      where: { id: roleId, orgId: ctx.orgId, isIndividual: false },
      data: { name: parsed.data.name },
    });
  } catch {
    return { error: "Роль с таким названием уже есть" };
  }

  revalidatePath(`/${orgSlug}/settings/roles`);
  return {};
}

export async function updateCustomRolePermissions(
  orgSlug: string,
  roleId: string,
  resources: Record<string, ResourcePermission>,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customRoles", "edit");

  const parsed = saveSchema.safeParse({ resources });
  if (!parsed.success) {
    return { error: "Неверные данные" };
  }

  const role = await prisma.customRole.findFirst({ where: { id: roleId, orgId: ctx.orgId } });
  if (!role) {
    return { error: "Роль не найдена" };
  }

  const clamped = clampToCeiling(parsed.data.resources, ctx.capabilities, NON_OVERRIDABLE_RESOURCES);
  const permissions: CustomRolePermissionsV2 = { version: 2, resources: clamped };

  await prisma.customRole.update({
    where: { id: roleId, orgId: ctx.orgId },
    data: { permissions: permissions as unknown as Prisma.InputJsonValue },
  });

  revalidatePath(`/${orgSlug}/settings/roles`);
  revalidatePath(`/${orgSlug}/settings/roles/${roleId}`);
  return {};
}

export async function deleteCustomRole(orgSlug: string, roleId: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customRoles", "delete");

  await prisma.customRole.delete({ where: { id: roleId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/roles`);
  return {};
}

/** Block I2.1 — "Индивидуальные настройки" → "+ Роль" on an employee's
 * Access card: promotes a hidden per-membership role to a named, reusable
 * one. Pure metadata flip, no data copy — the permissions JSON is untouched. */
export async function promoteIndividualRole(orgSlug: string, roleId: string, name: string): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "customRoles", "edit");

  const parsed = createSchema.safeParse({ name });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  try {
    await prisma.customRole.update({
      where: { id: roleId, orgId: ctx.orgId, isIndividual: true },
      data: { isIndividual: false, name: parsed.data.name },
    });
  } catch {
    return { error: "Роль с таким названием уже есть" };
  }

  revalidatePath(`/${orgSlug}/settings/roles`);
  return {};
}
