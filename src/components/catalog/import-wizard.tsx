"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TARGET_FIELDS,
  detectCharacteristicColumns,
  autoDetectMapping,
  CHARACTERISTIC_COLUMN_PREFIX,
} from "@/lib/import/target-fields";
import {
  uploadAndParseImportFile,
  startImportJob,
  processImportBatch,
  processVariantBatch,
  finalizeImportJob,
  type ImportRowInput,
  type VariantRowInput,
} from "@/actions/catalog-import";
import type { SearchBy } from "@/lib/import/matching";

const BATCH_SIZE = 75;

type Step = "upload" | "mapping" | "options" | "running" | "done";

const SEARCH_BY_ITEMS: Record<SearchBy, string> = {
  AUTO: "Автоматически",
  SKU: "Код/Артикул",
  BARCODE: "Штрихкод",
  NAME: "Наименование",
};

interface Progress {
  totalRows: number;
  processedRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
}

interface FailedRow {
  rowNumber: number;
  error: string;
}

function isVariantType(raw: string | undefined): boolean {
  return (raw ?? "").trim().toLowerCase() === "модификация";
}

export function ImportWizard({ orgSlug }: { orgSlug: string }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fileName, setFileName] = useState("");
  const [encoding, setEncoding] = useState<"utf-8" | "windows-1251">("utf-8");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});

  const [searchBy, setSearchBy] = useState<SearchBy>("AUTO");
  const [updateOnly, setUpdateOnly] = useState(false);

  const [progress, setProgress] = useState<Progress>({
    totalRows: 0,
    processedRows: 0,
    createdCount: 0,
    updatedCount: 0,
    errorCount: 0,
  });
  const [failedRows, setFailedRows] = useState<FailedRow[]>([]);

  function reset() {
    setStep("upload");
    setBusy(false);
    setError(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setSearchBy("AUTO");
    setUpdateOnly(false);
    setProgress({ totalRows: 0, processedRows: 0, createdCount: 0, updatedCount: 0, errorCount: 0 });
    setFailedRows([]);
  }

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    const formData = new FormData();
    formData.set("file", file);
    formData.set("encoding", encoding);
    const result = await uploadAndParseImportFile(orgSlug, formData);
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setFileName(file.name);
    setHeaders(result.headers);
    setRows(result.rows);
    setMapping(autoDetectMapping(result.headers));
    setStep("mapping");
  }

  function columnIndex(header: string): number {
    return headers.indexOf(header);
  }

  function buildProductRows(): ImportRowInput[] {
    const groupPathHeader = headers.find((h) => mapping[h] === "groupPath");
    const unitNameHeader = headers.find((h) => mapping[h] === "unitName");
    const nameHeader = headers.find((h) => mapping[h] === "name");
    const typeHeader = headers.find((h) => mapping[h] === "type");
    const skuHeader = headers.find((h) => mapping[h] === "sku");
    const barcodeHeader = headers.find((h) => mapping[h] === "barcode");
    const unitPriceHeader = headers.find((h) => mapping[h] === "unitPrice");
    const currencyHeader = headers.find((h) => mapping[h] === "currency");

    const result: ImportRowInput[] = [];
    rows.forEach((row, idx) => {
      const type = typeHeader ? row[columnIndex(typeHeader)] : undefined;
      if (isVariantType(type)) return;
      result.push({
        rowNumber: idx + 1,
        type,
        name: nameHeader ? row[columnIndex(nameHeader)] : undefined,
        sku: skuHeader ? row[columnIndex(skuHeader)] : undefined,
        barcode: barcodeHeader ? row[columnIndex(barcodeHeader)] : undefined,
        unitPrice: unitPriceHeader ? row[columnIndex(unitPriceHeader)] : undefined,
        currency: currencyHeader ? row[columnIndex(currencyHeader)] : undefined,
        groupPath: groupPathHeader ? row[columnIndex(groupPathHeader)] : undefined,
        unitName: unitNameHeader ? row[columnIndex(unitNameHeader)] : undefined,
      });
    });
    return result;
  }

  function buildVariantRows(): VariantRowInput[] {
    const typeHeader = headers.find((h) => mapping[h] === "type");
    const parentSkuHeader = headers.find((h) => mapping[h] === "parentSku");
    const skuHeader = headers.find((h) => mapping[h] === "sku");
    const barcodeHeader = headers.find((h) => mapping[h] === "barcode");
    const charHeaders = detectCharacteristicColumns(headers);

    const result: VariantRowInput[] = [];
    rows.forEach((row, idx) => {
      const type = typeHeader ? row[columnIndex(typeHeader)] : undefined;
      if (!isVariantType(type)) return;
      const characteristics: Record<string, string> = {};
      for (const c of charHeaders) {
        const value = row[columnIndex(c.header)];
        if (value?.trim()) characteristics[c.characteristicName] = value;
      }
      result.push({
        rowNumber: idx + 1,
        parentSku: parentSkuHeader ? row[columnIndex(parentSkuHeader)] : undefined,
        sku: skuHeader ? row[columnIndex(skuHeader)] : undefined,
        barcode: barcodeHeader ? row[columnIndex(barcodeHeader)] : undefined,
        characteristics,
      });
    });
    return result;
  }

  async function runImport() {
    setStep("running");
    setBusy(true);
    setError(null);

    const productRows = buildProductRows();
    const variantRows = buildVariantRows();
    const totalRows = productRows.length + variantRows.length;
    setProgress({ totalRows, processedRows: 0, createdCount: 0, updatedCount: 0, errorCount: 0 });

    const started = await startImportJob(orgSlug, {
      fileName,
      searchBy,
      updateOnly,
      columnMapping: mapping,
      totalRows,
    });
    if ("error" in started) {
      setError(started.error);
      setBusy(false);
      return;
    }
    const { importJobId } = started;
    const collectedErrors: FailedRow[] = [];

    try {
      for (let i = 0; i < productRows.length; i += BATCH_SIZE) {
        const batch = productRows.slice(i, i + BATCH_SIZE);
        const result = await processImportBatch(orgSlug, importJobId, batch);
        collectedErrors.push(...result.errors);
        setProgress((p) => ({
          totalRows: p.totalRows,
          processedRows: p.processedRows + batch.length,
          createdCount: p.createdCount + result.createdCount,
          updatedCount: p.updatedCount + result.updatedCount,
          errorCount: p.errorCount + result.errorCount,
        }));
      }

      for (let i = 0; i < variantRows.length; i += BATCH_SIZE) {
        const batch = variantRows.slice(i, i + BATCH_SIZE);
        const result = await processVariantBatch(orgSlug, importJobId, batch);
        collectedErrors.push(...result.errors);
        setProgress((p) => ({
          totalRows: p.totalRows,
          processedRows: p.processedRows + batch.length,
          createdCount: p.createdCount + result.createdCount,
          updatedCount: p.updatedCount + result.updatedCount,
          errorCount: p.errorCount + result.errorCount,
        }));
      }

      await finalizeImportJob(orgSlug, importJobId);
      setFailedRows(collectedErrors);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка при выполнении импорта");
    } finally {
      setBusy(false);
    }
  }

  function downloadFailedRows() {
    const lines = [[...headers, "Ошибка"].join(",")];
    for (const failed of failedRows) {
      const row = rows[failed.rowNumber - 1] ?? [];
      const cells = [...row, failed.error].map((v) => `"${(v ?? "").replace(/"/g, '""')}"`);
      lines.push(cells.join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "неудачные-строки.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const requiredFieldsMapped = TARGET_FIELDS.filter((f) => f.required).every((f) =>
    Object.values(mapping).includes(f.key),
  );
  const charColumns = detectCharacteristicColumns(headers);
  const variantCount = rows.filter((row) => {
    const typeHeader = headers.find((h) => mapping[h] === "type");
    return typeHeader && isVariantType(row[columnIndex(typeHeader)]);
  }).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload className="size-4" />
        Импорт из Excel
      </Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Импорт товаров из Excel/CSV</DialogTitle>
        </DialogHeader>

        {error && <p className="mx-4 text-sm text-destructive">{error}</p>}

        {step === "upload" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <Input
              type="file"
              accept=".xlsx,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
              disabled={busy}
            />
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Кодировка CSV</span>
              <Select value={encoding} items={{ "utf-8": "UTF-8", "windows-1251": "Windows-1251" }} onValueChange={(v) => setEncoding(v as "utf-8" | "windows-1251")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utf-8">UTF-8</SelectItem>
                  <SelectItem value="windows-1251">Windows-1251</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">Поддерживаются XLSX и CSV, до 10MB.</p>
          </div>
        )}

        {step === "mapping" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Сопоставьте столбцы файла с полями каталога. «Код/Артикул» — одно поле для «Кода» и «Артикула».
            </p>
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Столбец файла</TableHead>
                    <TableHead>Поле</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header) => {
                    const isChar = header.startsWith(CHARACTERISTIC_COLUMN_PREFIX);
                    return (
                      <TableRow key={header}>
                        <TableCell className="font-medium">{header}</TableCell>
                        <TableCell>
                          {isChar ? (
                            <span className="text-sm text-muted-foreground">{header} (характеристика)</span>
                          ) : (
                            <Select
                              value={mapping[header] ?? "__none__"}
                              items={{
                                __none__: "Не загружать",
                                ...Object.fromEntries(TARGET_FIELDS.map((f) => [f.key, f.label])),
                              }}
                              onValueChange={(v) =>
                                setMapping((m) => ({ ...m, [header]: v === "__none__" ? null : v }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Не загружать</SelectItem>
                                {TARGET_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("upload")}>
                Назад
              </Button>
              <Button type="button" disabled={!requiredFieldsMapped} onClick={() => setStep("options")}>
                Далее
              </Button>
            </div>
          </div>
        )}

        {step === "options" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Искать по</span>
              <Select value={searchBy} items={SEARCH_BY_ITEMS} onValueChange={(v) => setSearchBy(v as SearchBy)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SEARCH_BY_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={updateOnly} onCheckedChange={(checked) => setUpdateOnly(checked === true)} />
              Обновлять только существующие, не создавать новые
            </label>
            <p className="text-sm text-muted-foreground">
              Строк: {rows.length}, из них модификаций: {variantCount}
              {charColumns.length > 0 && `, характеристик: ${charColumns.length}`}
            </p>
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("mapping")}>
                Назад
              </Button>
              <Button type="button" onClick={() => void runImport()}>
                Запустить импорт
              </Button>
            </div>
          </div>
        )}

        {step === "running" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <Progress value={progress.totalRows ? (progress.processedRows / progress.totalRows) * 100 : 0} />
            <p className="text-sm text-muted-foreground">
              Обработано {progress.processedRows} из {progress.totalRows} — создано {progress.createdCount}, обновлено{" "}
              {progress.updatedCount}, ошибок {progress.errorCount}
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <p className="text-sm">
              Готово: создано {progress.createdCount}, обновлено {progress.updatedCount}, ошибок {progress.errorCount}
              из {progress.totalRows}.
            </p>
            {failedRows.length > 0 && (
              <Button type="button" variant="outline" onClick={downloadFailedRows}>
                Скачать неудачные строки
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Закрыть
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
