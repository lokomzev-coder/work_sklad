"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { assertPermission } from "@/lib/permissions";
import type { Prisma, CatalogItemType } from "@/generated/prisma/client";
import { parseImportFile as parseFileBuffer, type CsvEncoding } from "@/lib/import/parse-file";
import { findOrCreateGroupByPath } from "@/lib/import/resolve-group-path";
import { findOrCreateUnitByName } from "@/lib/import/resolve-unit";
import { findOrCreateCharacteristicByName } from "@/lib/import/resolve-characteristic";
import { matchCatalogItem, getMatchKeyValue, type SearchBy } from "@/lib/import/matching";
import { createCatalogVariantRecord } from "@/actions/catalog-variants";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface ParsedFileResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
}

// Step 1 of the wizard: upload the file and parse it fully. Nothing is
// written to disk — the buffer lives only for this one Server Action call,
// and every row goes back to the browser as JSON (see ROADMAP.md's Block J
// scope cuts). Needs experimental.serverActions.bodySizeLimit="10mb" in
// next.config.ts, otherwise Next's own 1MB default rejects the upload
// before this code ever runs.
export async function uploadAndParseImportFile(
  orgSlug: string,
  formData: FormData,
): Promise<ParsedFileResult | { error: string }> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalogImport", "create");

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Файл не выбран" };
  if (file.size > MAX_FILE_SIZE) return { error: "Файл больше 10MB" };

  const encoding = (formData.get("encoding") as CsvEncoding | null) ?? "utf-8";
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    const parsed = await parseFileBuffer(file.name, buffer, encoding);
    return { ...parsed, totalRows: parsed.rows.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Не удалось разобрать файл" };
  }
}

export interface StartImportJobInput {
  fileName: string;
  searchBy: SearchBy;
  updateOnly: boolean;
  columnMapping: Record<string, string | null>;
  totalRows: number;
}

// Creates the ImportJob row the browser will report progress against via
// repeated processImportBatch/processVariantBatch calls — see the schema
// comment on ImportJob for why this models browser-driven progress, not a
// real background queue.
export async function startImportJob(
  orgSlug: string,
  input: StartImportJobInput,
): Promise<{ importJobId: string } | { error: string }> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalogImport", "create");

  const job = await prisma.importJob.create({
    data: {
      orgId: ctx.orgId,
      createdById: ctx.userId,
      fileName: input.fileName,
      searchBy: input.searchBy,
      updateOnly: input.updateOnly,
      columnMapping: input.columnMapping as unknown as Prisma.InputJsonValue,
      totalRows: input.totalRows,
    },
  });

  return { importJobId: job.id };
}

export interface ImportRowInput {
  rowNumber: number;
  type?: string;
  name?: string;
  sku?: string;
  barcode?: string;
  unitPrice?: string;
  currency?: string;
  groupPath?: string;
  unitName?: string;
}

export interface VariantRowInput {
  rowNumber: number;
  parentSku?: string;
  sku?: string;
  barcode?: string;
  characteristics: Record<string, string>;
}

export interface BatchResult {
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  // Returned alongside the counts so the browser can accumulate a "failed
  // rows" download across every batch call without a separate fetch at the
  // end — the server never re-derives this from ImportJobRow later.
  errors: { rowNumber: number; error: string }[];
}

// Variants have no field guaranteed unique/present the way products have
// sku/barcode/name — sku/barcode are both optional and often blank (as in
// МойСклад's own template). What actually identifies "the same modification"
// on re-import is the exact set of characteristic values a row declares
// (e.g. Цвет=Красный) against a given parent. Without this check, importing
// the same file twice would create a second identical variant every time —
// confirmed live before this fix was added.
async function findExistingVariantId(
  catalogItemId: string,
  values: { characteristicId: string; value: string }[],
): Promise<string | null> {
  const existing = await prisma.catalogItemVariant.findMany({
    where: { catalogItemId },
    select: { id: true, values: { select: { characteristicId: true, value: true } } },
  });
  const wanted = new Set(values.map((v) => `${v.characteristicId}::${v.value}`));
  for (const variant of existing) {
    const have = new Set(variant.values.map((v) => `${v.characteristicId}::${v.value}`));
    if (have.size === wanted.size && [...wanted].every((k) => have.has(k))) {
      return variant.id;
    }
  }
  return null;
}

const TYPE_LABELS: Record<string, CatalogItemType> = {
  "товар": "PRODUCT",
  "услуга": "SERVICE",
  "комплект": "BUNDLE",
};

function normalizeType(raw: string | undefined): CatalogItemType | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return "PRODUCT";
  return TYPE_LABELS[v] ?? null;
}

const FIELD_LABELS: Record<string, string> = {
  sku: "Код/Артикул",
  barcode: "Штрихкод",
  name: "Наименование",
};

function errorRow(
  importJobId: string,
  rowNumber: number,
  rawData: unknown,
  error: string,
): Prisma.ImportJobRowCreateManyInput {
  return {
    importJobId,
    rowNumber,
    success: false,
    error,
    rawData: rawData as Prisma.InputJsonValue,
  };
}

interface NormalizedProductRow {
  name: string;
  type: CatalogItemType;
  sku?: string;
  barcode?: string;
  unitPrice: number;
  currency: string;
  groupPath?: string;
  unitName?: string;
}

function normalizeProductRow(row: ImportRowInput): { data: NormalizedProductRow } | { error: string } {
  const name = row.name?.trim();
  if (!name) return { error: "Не заполнено обязательное поле «Наименование»" };

  const type = normalizeType(row.type);
  if (!type) return { error: `Неизвестный тип «${row.type}»` };

  const unitPriceRaw = row.unitPrice?.trim().replace(",", ".");
  const unitPrice = unitPriceRaw ? Number(unitPriceRaw) : NaN;
  if (!unitPriceRaw || Number.isNaN(unitPrice) || unitPrice < 0) {
    return { error: "Не заполнено или некорректно обязательное поле «Цена продажи»" };
  }

  return {
    data: {
      name,
      type,
      sku: row.sku?.trim() || undefined,
      barcode: row.barcode?.trim() || undefined,
      unitPrice,
      currency: row.currency?.trim() || "RUB",
      groupPath: row.groupPath?.trim() || undefined,
      unitName: row.unitName?.trim() || undefined,
    },
  };
}

// Pass 1 of the wizard's two-pass import: ordinary PRODUCT/SERVICE/BUNDLE
// rows. Must fully complete (all batches) before processVariantBatch runs,
// since variant rows attach to a parent by looking up its sku, which only
// resolves once this pass has created/updated it.
export async function processImportBatch(
  orgSlug: string,
  importJobId: string,
  rows: ImportRowInput[],
): Promise<BatchResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalogImport", "create");

  const job = await prisma.importJob.findFirst({ where: { id: importJobId, orgId: ctx.orgId } });
  if (!job) throw new Error("Импорт не найден");
  const searchBy = job.searchBy as SearchBy;

  // Cross-batch defensive duplicate detection: reconstruct the set of
  // match-key values already claimed by earlier batches of THIS import (an
  // in-memory Set alone only protects within one call — a separate call may
  // be a separate serverless instance).
  const priorRows = await prisma.importJobRow.findMany({
    where: { importJobId, success: true, catalogItemId: { not: null } },
    select: { catalogItemId: true },
  });
  const priorItems = priorRows.length
    ? await prisma.catalogItem.findMany({
        where: { id: { in: priorRows.map((r) => r.catalogItemId!) } },
        select: { sku: true, barcode: true, name: true },
      })
    : [];
  const seenKeys = new Set<string>();
  for (const item of priorItems) {
    const key = getMatchKeyValue(searchBy, {
      sku: item.sku ?? undefined,
      barcode: item.barcode ?? undefined,
      name: item.name,
    });
    if (key) seenKeys.add(key);
  }

  const groupCache = new Map<string, string>();
  const unitCache = new Map<string, string>();
  const rowResults: Prisma.ImportJobRowCreateManyInput[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  // Sequential, not Promise.all — both the in-call `seenKeys` set and the
  // find-or-create caches need a stable processing order within the batch.
  for (const row of rows) {
    try {
      const normalized = normalizeProductRow(row);
      if ("error" in normalized) {
        rowResults.push(errorRow(importJobId, row.rowNumber, row, normalized.error));
        errorCount++;
        continue;
      }
      const { name, type, sku, barcode, unitPrice, currency, groupPath, unitName } = normalized.data;

      const matchKey = getMatchKeyValue(searchBy, { sku, barcode, name });
      if (matchKey && seenKeys.has(matchKey)) {
        rowResults.push(errorRow(importJobId, row.rowNumber, row, "Запись уже импортирована"));
        errorCount++;
        continue;
      }

      const match = await matchCatalogItem(ctx.orgId, searchBy, { sku, barcode, name });
      if (match.status === "ambiguous") {
        rowResults.push(
          errorRow(
            importJobId,
            row.rowNumber,
            row,
            `Найдено несколько товаров с полем «${FIELD_LABELS[match.field]}» = «${
              match.field === "sku" ? sku : match.field === "barcode" ? barcode : name
            }» — обновление невозможно`,
          ),
        );
        errorCount++;
        continue;
      }

      const groupId = groupPath ? await findOrCreateGroupByPath(ctx.orgId, groupPath, groupCache) : undefined;
      const unitId = unitName ? await findOrCreateUnitByName(ctx.orgId, unitName, unitCache) : undefined;

      let catalogItemId: string;
      let createdNew: boolean;

      if (match.status === "found") {
        await prisma.catalogItem.update({
          where: { id: match.itemId },
          data: {
            name,
            type,
            sku: sku ?? null,
            barcode: barcode ?? null,
            unitPrice,
            currency,
            groupId: groupId ?? null,
            unitId: unitId ?? null,
          },
        });
        catalogItemId = match.itemId;
        createdNew = false;
        updatedCount++;
      } else {
        if (job.updateOnly) {
          rowResults.push(errorRow(importJobId, row.rowNumber, row, "Товар не найден, создание запрещено настройкой"));
          errorCount++;
          continue;
        }
        const created = await prisma.catalogItem.create({
          data: { orgId: ctx.orgId, name, type, sku, barcode, unitPrice, currency, groupId, unitId },
        });
        catalogItemId = created.id;
        createdNew = true;
        createdCount++;
      }

      if (matchKey) seenKeys.add(matchKey);
      rowResults.push({
        importJobId,
        rowNumber: row.rowNumber,
        success: true,
        catalogItemId,
        createdNew,
      });
    } catch (e) {
      errorCount++;
      rowResults.push(errorRow(importJobId, row.rowNumber, row, e instanceof Error ? e.message : "Неизвестная ошибка"));
    }
  }

  await prisma.$transaction([
    prisma.importJobRow.createMany({ data: rowResults }),
    prisma.importJob.update({
      where: { id: importJobId },
      data: {
        processedRows: { increment: rows.length },
        createdCount: { increment: createdCount },
        updatedCount: { increment: updatedCount },
        errorCount: { increment: errorCount },
      },
    }),
  ]);

  const errors = rowResults
    .filter((r): r is Prisma.ImportJobRowCreateManyInput & { success: false; error: string } => r.success === false)
    .map((r) => ({ rowNumber: r.rowNumber, error: r.error }));

  return { createdCount, updatedCount, errorCount, errors };
}

// Pass 2: rows with Тип=Модификация, linked to an already-created/updated
// parent PRODUCT via "Код товара модификации" (= the parent's sku). Only
// call this after every processImportBatch call of pass 1 has resolved.
export async function processVariantBatch(
  orgSlug: string,
  importJobId: string,
  rows: VariantRowInput[],
): Promise<BatchResult> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalogImport", "create");

  const job = await prisma.importJob.findFirst({ where: { id: importJobId, orgId: ctx.orgId } });
  if (!job) throw new Error("Импорт не найден");

  const characteristicCache = new Map<string, string>();
  const rowResults: Prisma.ImportJobRowCreateManyInput[] = [];
  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      const parentSku = row.parentSku?.trim();
      if (!parentSku) {
        rowResults.push(errorRow(importJobId, row.rowNumber, row, "Не заполнено «Код товара модификации»"));
        errorCount++;
        continue;
      }

      const parent = await prisma.catalogItem.findFirst({
        where: { orgId: ctx.orgId, sku: parentSku, type: "PRODUCT" },
      });
      if (!parent) {
        rowResults.push(errorRow(importJobId, row.rowNumber, row, `Родительский товар с артикулом «${parentSku}» не найден`));
        errorCount++;
        continue;
      }

      const values: { characteristicId: string; value: string }[] = [];
      for (const [charName, value] of Object.entries(row.characteristics)) {
        if (!value?.trim()) continue;
        const characteristicId = await findOrCreateCharacteristicByName(ctx.orgId, charName, characteristicCache);
        values.push({ characteristicId, value: value.trim() });
      }

      const sku = row.sku?.trim() || undefined;
      const barcode = row.barcode?.trim() || undefined;
      const existingVariantId = await findExistingVariantId(parent.id, values);

      if (existingVariantId) {
        await prisma.catalogItemVariant.update({
          where: { id: existingVariantId },
          data: { sku: sku ?? null, barcode: barcode ?? null },
        });
        updatedCount++;
      } else {
        const result = await createCatalogVariantRecord(ctx.orgId, parent.id, { sku, barcode, values });
        if ("error" in result) {
          rowResults.push(errorRow(importJobId, row.rowNumber, row, result.error));
          errorCount++;
          continue;
        }
        createdCount++;
      }

      rowResults.push({
        importJobId,
        rowNumber: row.rowNumber,
        success: true,
        catalogItemId: parent.id,
        createdNew: !existingVariantId,
      });
    } catch (e) {
      errorCount++;
      rowResults.push(errorRow(importJobId, row.rowNumber, row, e instanceof Error ? e.message : "Неизвестная ошибка"));
    }
  }

  await prisma.$transaction([
    prisma.importJobRow.createMany({ data: rowResults }),
    prisma.importJob.update({
      where: { id: importJobId },
      data: {
        processedRows: { increment: rows.length },
        createdCount: { increment: createdCount },
        updatedCount: { increment: updatedCount },
        errorCount: { increment: errorCount },
      },
    }),
  ]);

  const errors = rowResults
    .filter((r): r is Prisma.ImportJobRowCreateManyInput & { success: false; error: string } => r.success === false)
    .map((r) => ({ rowNumber: r.rowNumber, error: r.error }));

  return { createdCount, updatedCount, errorCount, errors };
}

export async function finalizeImportJob(orgSlug: string, importJobId: string): Promise<void> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalogImport", "create");

  await prisma.importJob.update({
    where: { id: importJobId, orgId: ctx.orgId },
    data: { status: "COMPLETED", finishedAt: new Date() },
  });

  revalidatePath(`/${orgSlug}/catalog`);
  revalidatePath(`/${orgSlug}/settings/import`);
}

// No cron/scheduler exists to do this proactively (see ROADMAP.md's Block J
// scope cuts) — called once when the history page renders, to lazily flag
// any RUNNING job whose browser tab was closed mid-import.
const ABANDONED_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export async function markAbandonedIfStale(orgSlug: string): Promise<void> {
  const ctx = await getOrgContext(orgSlug);
  assertPermission(ctx, "catalogImport", "view");

  await prisma.importJob.updateMany({
    where: {
      orgId: ctx.orgId,
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - ABANDONED_THRESHOLD_MS) },
    },
    data: { status: "ABANDONED", finishedAt: new Date() },
  });
}
