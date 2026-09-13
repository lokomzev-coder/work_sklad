import ExcelJS from "exceljs";
import Papa from "papaparse";

// Block J: XLSX (via exceljs) and CSV (via papaparse) only — no legacy
// binary XLS support, a deliberate scope cut (see ROADMAP.md). Nothing here
// ever writes to disk: the whole file lives in the Buffer/string passed in
// and whatever this returns, for the duration of one Server Action call.
export interface ParsedFile {
  headers: string[];
  rows: string[][];
}

export type CsvEncoding = "utf-8" | "windows-1251";

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    // Rich text / formula / hyperlink cells — exceljs represents these as
    // objects rather than plain strings/numbers.
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return String((value as { result: unknown }).result ?? "");
    if (value instanceof Date) return value.toISOString();
    return "";
  }
  return String(value);
}

async function parseXlsx(buffer: Buffer): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's own Buffer type predates Node's newer generic Buffer<T> —
  // functionally identical at runtime, just a type-lib version mismatch.
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  const rows: string[][] = [];
  let headers: string[] = [];
  worksheet.eachRow((row, rowNumber) => {
    // exceljs's row.values is 1-indexed (index 0 is always undefined) —
    // slice it off so column 1 of the sheet becomes index 0 of our arrays.
    const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellToString);
    if (rowNumber === 1) {
      headers = values;
    } else {
      rows.push(values);
    }
  });

  return { headers, rows };
}

function parseCsv(buffer: Buffer, encoding: CsvEncoding): ParsedFile {
  const text = new TextDecoder(encoding).decode(buffer);
  const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const [headers, ...rows] = result.data;
  return { headers: headers ?? [], rows };
}

export async function parseImportFile(
  fileName: string,
  buffer: Buffer,
  csvEncoding: CsvEncoding,
): Promise<ParsedFile> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return parseCsv(buffer, csvEncoding);
  if (lower.endsWith(".xlsx")) return parseXlsx(buffer);
  throw new Error("Поддерживаются только файлы .xlsx и .csv");
}
