"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getPlatformAdminContext,
  assertPlatformPermission,
  parsePlatformRolePermissions,
  type PlatformCapability,
} from "@/lib/platform-auth";

export interface PlatformActionResult {
  error?: string;
  id?: string;
}

const permissionsSchema = z.record(z.string(), z.boolean());

function sanitizePermissions(raw: unknown): Record<PlatformCapability, boolean> {
  return parsePlatformRolePermissions(permissionsSchema.parse(raw));
}

/** Блок L фаза 2 — flexible platform-admin roles, same JSON-blob idiom as
 * org-side CustomRole.permissions (Block I). Gated by "manageAdmins" — by
 * default only the owner has it, matching the explicit request that role
 * management itself stays tightly held. */
export async function createPlatformRole(name: string, permissions: unknown): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Укажите название роли" };
  }

  const role = await prisma.platformRole.create({
    data: { name: trimmedName, permissions: sanitizePermissions(permissions) },
  });
  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: "PLATFORM_ROLE_CREATED",
      after: { id: role.id, name: role.name, permissions: role.permissions },
    },
  });

  revalidatePath("/admin/roles");
  return { id: role.id };
}

export async function updatePlatformRole(
  id: string,
  name: string,
  permissions: unknown,
): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const before = await prisma.platformRole.findUnique({ where: { id } });
  if (!before) {
    return { error: "Роль не найдена" };
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Укажите название роли" };
  }

  const role = await prisma.platformRole.update({
    where: { id },
    data: { name: trimmedName, permissions: sanitizePermissions(permissions) },
  });
  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: "PLATFORM_ROLE_UPDATED",
      before: { name: before.name, permissions: before.permissions },
      after: { name: role.name, permissions: role.permissions },
    },
  });

  revalidatePath("/admin/roles");
  return { id: role.id };
}

/** Refuses if any admin currently holds this role — deleting it would
 * silently drop them to zero capabilities (onDelete: SetNull on the FK).
 * Reassign them first; a silent mass-demotion is not something this
 * action should ever do implicitly. */
export async function deletePlatformRole(id: string): Promise<PlatformActionResult> {
  const ctx = await getPlatformAdminContext();
  assertPlatformPermission(ctx, "manageAdmins");

  const inUseCount = await prisma.platformAdmin.count({ where: { platformRoleId: id } });
  if (inUseCount > 0) {
    return { error: `Роль назначена ${inUseCount} администратору(ам) — сначала переназначьте им другую роль` };
  }

  const role = await prisma.platformRole.delete({ where: { id } });
  await prisma.platformAuditLog.create({
    data: {
      platformAdminId: ctx.platformAdminId,
      action: "PLATFORM_ROLE_DELETED",
      before: { name: role.name, permissions: role.permissions },
    },
  });

  revalidatePath("/admin/roles");
  return {};
}
