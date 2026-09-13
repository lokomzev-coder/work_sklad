"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import { archiveOrDelete } from "@/lib/archive";
import { getOrgBaseCurrency } from "@/lib/currency";

export interface ActionResult {
  error?: string;
}

export interface QuickCreateProjectResult {
  project?: { id: string; name: string };
  error?: string;
}

/** Minimal project creation for the inline "+ create" picker on the order
 * form (see components/orders/project-combobox.tsx) — same shape/purpose as
 * quickCreateClient. Only Name (+ optional Client) is collected here; the
 * richer fields (dates/budget/responsible employee) are filled in later on
 * the full /projects/[id] page. */
export async function quickCreateProject(
  orgSlug: string,
  input: { name: string; clientId?: string | null },
): Promise<QuickCreateProjectResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "projects", "create");

  const name = input.name.trim();
  if (!name) {
    return { error: "Введите название" };
  }

  if (input.clientId) {
    const client = await prisma.client.findFirst({ where: { id: input.clientId, orgId: ctx.orgId } });
    if (!client) {
      return { error: "Клиент не найден" };
    }
  }

  const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
  const project = await prisma.project.create({
    data: { orgId: ctx.orgId, name, clientId: input.clientId ?? null, currency: baseCurrency },
  });

  revalidatePath(`/${orgSlug}/projects`);
  return { project: { id: project.id, name: project.name } };
}

const upsertProjectSchema = z.object({
  name: z.string().trim().min(1, "Введите название").max(200),
  clientId: z.string().min(1).nullable().optional(),
  responsibleEmployeeId: z.string().min(1).nullable().optional(),
  startDate: z.string().min(1).nullable().optional(),
  endDate: z.string().min(1).nullable().optional(),
  budget: z.coerce.number().nonnegative("Бюджет не может быть отрицательным").nullable().optional(),
});

export interface UpsertProjectInput {
  name: string;
  clientId?: string | null;
  responsibleEmployeeId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
}

export interface UpsertProjectResult extends ActionResult {
  projectId?: string;
}

export async function upsertProject(
  orgSlug: string,
  projectId: string | null,
  input: UpsertProjectInput,
): Promise<UpsertProjectResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "projects", projectId ? "edit" : "create");

  const parsed = upsertProjectSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  if (parsed.data.clientId) {
    const client = await prisma.client.findFirst({ where: { id: parsed.data.clientId, orgId: ctx.orgId } });
    if (!client) {
      return { error: "Клиент не найден" };
    }
  }
  if (parsed.data.responsibleEmployeeId) {
    const employee = await prisma.employee.findFirst({
      where: { id: parsed.data.responsibleEmployeeId, orgId: ctx.orgId },
    });
    if (!employee) {
      return { error: "Сотрудник не найден" };
    }
  }

  const data = {
    name: parsed.data.name,
    clientId: parsed.data.clientId ?? null,
    responsibleEmployeeId: parsed.data.responsibleEmployeeId ?? null,
    startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
    budget: parsed.data.budget ?? null,
  };

  let projectIdResult: string;
  if (projectId) {
    await prisma.project.update({ where: { id: projectId, orgId: ctx.orgId }, data });
    projectIdResult = projectId;
  } else {
    const baseCurrency = await getOrgBaseCurrency(ctx.orgId);
    const project = await prisma.project.create({ data: { ...data, orgId: ctx.orgId, currency: baseCurrency } });
    projectIdResult = project.id;
  }

  revalidatePath(`/${orgSlug}/projects`);
  revalidatePath(`/${orgSlug}/projects/${projectIdResult}`);
  return { projectId: projectIdResult };
}

export async function archiveProject(orgSlug: string, projectId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "projects", "edit");

  await prisma.project.update({
    where: { id: projectId, orgId: ctx.orgId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/projects`);
}

export async function restoreProject(orgSlug: string, projectId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "projects", "edit");

  await prisma.project.update({
    where: { id: projectId, orgId: ctx.orgId },
    data: { status: "ACTIVE", archivedAt: null },
  });

  revalidatePath(`/${orgSlug}/projects`);
}

export async function deleteProject(orgSlug: string, projectId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "projects", "delete");

  const result = await archiveOrDelete("project", projectId, ctx.orgId);

  revalidatePath(`/${orgSlug}/projects`);
  return result;
}
