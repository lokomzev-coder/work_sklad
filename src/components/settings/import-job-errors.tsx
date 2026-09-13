"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface ImportJobErrorRow {
  rowNumber: number;
  error: string;
  rawData: Record<string, unknown> | null;
}

// Block J history page: unlike the wizard's own "Result" step (which
// downloads the failed-rows file straight from the browser's already-parsed
// file), this reads from ImportJobRow.rawData — the only copy of a failed
// row's values left once the original browser session/tab is gone.
export function ImportJobErrors({ rows }: { rows: ImportJobErrorRow[] }) {
  const [open, setOpen] = useState(false);

  function download() {
    const fieldNames = [...new Set(rows.flatMap((r) => Object.keys(r.rawData ?? {})))];
    const lines = [[...fieldNames, "Ошибка"].join(",")];
    for (const row of rows) {
      const cells = [...fieldNames.map((f) => String(row.rawData?.[f] ?? "")), row.error];
      lines.push(cells.map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "неудачные-строки.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Ошибки ({rows.length})
      </Button>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Неудачные строки</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Строка</TableHead>
                  <TableHead>Ошибка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell>{row.rowNumber}</TableCell>
                    <TableCell>{row.error}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button type="button" variant="outline" onClick={download}>
            Скачать неудачные строки
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
