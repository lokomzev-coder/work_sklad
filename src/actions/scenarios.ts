"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";

export interface ActionResult {
  error?: string;
}

const conditionSchema = z.object({
  field: z.enum(["STATUS", "COUNTERPARTY", "ASSIGNED_EMPLOYEE", "TOTAL", "QUANTITY"]),
  operator: z.enum(["EQUALS", "NOT_EQUALS", "GREATER_THAN", "GREATER_OR_EQUAL", "LESS_THAN", "LESS_OR_EQUAL"]),
  value: z.string().min(1),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CREATE_RELATED_DOCUMENT"),
    config: z.object({ targetType: z.enum(["INVOICE_OUT", "INVOICE_IN"]) }),
  }),
  z.object({
    type: z.literal("CREATE_NOTIFICATION"),
    config: z.object({
      allowedRoles: z.array(z.enum(["ADMIN", "MANAGER", "EMPLOYEE", "PRODUCTION", "CASHIER"])),
      allowedCustomRoleIds: z.array(z.string()),
      allowedEmployeeIds: z.array(z.string()),
      title: z.string().min(1, "Заполните заголовок"),
      body: z.string().min(1, "Заполните текст"),
    }),
  }),
  z.object({
    type: z.literal("SEND_WEBHOOK"),
    config: z.object({ webhookId: z.string().min(1) }),
  }),
]);

const createScenarioRuleSchema = z.object({
  name: z.string().min(1, "Введите название").max(200),
  documentType: z.enum(["ORDER", "PURCHASE_ORDER", "INVOICE_OUT", "INVOICE_IN", "PRODUCTION_ORDER"]),
  eventType: z.enum(["CREATED", "STATUS_CHANGED"]),
  conditions: z.array(conditionSchema),
  actions: z.array(actionSchema).min(1, "Добавьте хотя бы одно действие"),
});

export type CreateScenarioRuleInput = z.infer<typeof createScenarioRuleSchema>;

// CREATE_RELATED_DOCUMENT only has real conversion logic for these two
// pairs (Block M5 precedent) — reject anything else at save time, not just
// silently no-op at execution time (see lib/scenario-actions.ts).
const VALID_CONVERSIONS: Record<string, string> = {
  ORDER: "INVOICE_OUT",
  PURCHASE_ORDER: "INVOICE_IN",
};

export async function createScenarioRule(
  orgSlug: string,
  input: CreateScenarioRuleInput,
): Promise<ActionResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "scenarios", "create");

  const parsed = createScenarioRuleSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Неверные данные" };
  }

  for (const action of parsed.data.actions) {
    if (action.type === "CREATE_RELATED_DOCUMENT") {
      if (VALID_CONVERSIONS[parsed.data.documentType] !== action.config.targetType) {
        return { error: "Такое преобразование документа не поддерживается" };
      }
    }
    if (action.type === "SEND_WEBHOOK") {
      const webhook = await prisma.webhook.findFirst({
        where: { id: action.config.webhookId, orgId: ctx.orgId },
      });
      if (!webhook) return { error: "Вебхук не найден" };
    }
  }

  await prisma.scenarioRule.create({
    data: {
      orgId: ctx.orgId,
      name: parsed.data.name,
      documentType: parsed.data.documentType,
      eventType: parsed.data.eventType,
      conditions: {
        create: parsed.data.conditions.map((c, i) => ({ ...c, sortOrder: i })),
      },
      actions: {
        create: parsed.data.actions.map((a, i) => ({ type: a.type, config: a.config, sortOrder: i })),
      },
    },
  });

  revalidatePath(`/${orgSlug}/settings/scenarios`);
  return {};
}

export async function toggleScenarioRuleActive(orgSlug: string, ruleId: string, isActive: boolean) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "scenarios", "edit");

  await prisma.scenarioRule.update({
    where: { id: ruleId, orgId: ctx.orgId },
    data: { isActive },
  });

  revalidatePath(`/${orgSlug}/settings/scenarios`);
}

export async function deleteScenarioRule(orgSlug: string, ruleId: string) {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "scenarios", "delete");

  await prisma.scenarioRule.delete({ where: { id: ruleId, orgId: ctx.orgId } });

  revalidatePath(`/${orgSlug}/settings/scenarios`);
}
