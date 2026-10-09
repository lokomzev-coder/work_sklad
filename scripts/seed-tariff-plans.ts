/**
 * Block V (explicit request, 2026-09-21) — one-time seed for the 4 fixed
 * tariffs (Старт/Базовый/Профессиональный/Корпоративный, МойСклад-style)
 * and the 3 new gated feature keys (scenarios/custom_fields/
 * label_templates) that this block added alongside retail/production/
 * custom_roles (Block S). Every number/price here is a starting point, not
 * a locked-in decision — the platform admin edits both from the panel
 * (/admin/plans, /admin/feature-catalog) afterward exactly like any other
 * plan or catalog item.
 *
 * Idempotent — safe to run more than once: plans upsert by their unique
 * `name`, catalog items upsert by their unique `key`. Run manually:
 *
 *   npx tsx scripts/seed-tariff-plans.ts
 */
import "dotenv/config";

import { prisma } from "../src/lib/prisma";
import { KNOWN_FEATURE_KEYS } from "../src/lib/subscription";

const FEATURE_CATALOG_ITEMS: {
  key: string;
  label: string;
  description: string;
}[] = [
  { key: KNOWN_FEATURE_KEYS.retail, label: "Розница (касса)", description: "Доступ к разделу «Касса»" },
  { key: KNOWN_FEATURE_KEYS.production, label: "Производство", description: "Доступ к разделу «Производство»" },
  {
    key: KNOWN_FEATURE_KEYS.customRoles,
    label: "Управление правами пользователей",
    description: "Создание собственных ролей с настраиваемым набором прав",
  },
  {
    key: KNOWN_FEATURE_KEYS.scenarios,
    label: "Автоматические сценарии",
    description: "Создание сценариев автоматизации по документам",
  },
  {
    key: KNOWN_FEATURE_KEYS.customFields,
    label: "Дополнительные поля",
    description: "Собственные поля у товаров, клиентов, задач и документов",
  },
  {
    key: KNOWN_FEATURE_KEYS.labelTemplates,
    label: "Собственные шаблоны этикеток",
    description: "Конструктор шаблонов для печати этикеток",
  },
];

const PLANS: {
  name: string;
  priceMonthly: number;
  maxEmployees: number | null;
  maxOrdersPerMonth: number | null;
  maxStorageMb: number | null;
  maxStores: number | null;
  maxLegalEntities: number | null;
  features: string[];
}[] = [
  {
    name: "Старт",
    priceMonthly: 1990,
    maxEmployees: 2,
    maxOrdersPerMonth: null,
    maxStorageMb: 500,
    maxStores: 1,
    maxLegalEntities: 1,
    features: [],
  },
  {
    name: "Базовый",
    priceMonthly: 3990,
    maxEmployees: 5,
    maxOrdersPerMonth: null,
    maxStorageMb: 2048,
    maxStores: 2,
    maxLegalEntities: 2,
    features: [KNOWN_FEATURE_KEYS.retail, KNOWN_FEATURE_KEYS.customFields],
  },
  {
    name: "Профессиональный",
    priceMonthly: 7990,
    maxEmployees: 15,
    maxOrdersPerMonth: null,
    maxStorageMb: 5120,
    maxStores: 5,
    maxLegalEntities: 5,
    features: [
      KNOWN_FEATURE_KEYS.retail,
      KNOWN_FEATURE_KEYS.production,
      KNOWN_FEATURE_KEYS.customFields,
      KNOWN_FEATURE_KEYS.labelTemplates,
      KNOWN_FEATURE_KEYS.scenarios,
    ],
  },
  {
    name: "Корпоративный",
    priceMonthly: 14990,
    maxEmployees: null,
    maxOrdersPerMonth: null,
    maxStorageMb: null,
    maxStores: null,
    maxLegalEntities: null,
    features: Object.values(KNOWN_FEATURE_KEYS),
  },
];

async function main() {
  for (const item of FEATURE_CATALOG_ITEMS) {
    await prisma.subscriptionFeatureCatalogItem.upsert({
      where: { key: item.key },
      update: {},
      create: {
        key: item.key,
        label: item.label,
        description: item.description,
        kind: "FEATURE",
        unitPrice: 0,
        includedInAllPlans: false,
      },
    });
    console.log(`Catalog item ready: ${item.key}`);
  }

  for (const plan of PLANS) {
    const features = Object.fromEntries(plan.features.map((key) => [key, true]));
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {},
      create: {
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        currency: "RUB",
        maxEmployees: plan.maxEmployees,
        maxOrdersPerMonth: plan.maxOrdersPerMonth,
        maxStorageMb: plan.maxStorageMb,
        maxStores: plan.maxStores,
        maxLegalEntities: plan.maxLegalEntities,
        features,
        isCustom: false,
      },
    });
    console.log(`Plan ready: ${plan.name}`);
  }

  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
