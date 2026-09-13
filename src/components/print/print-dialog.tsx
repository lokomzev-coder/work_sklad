"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type DocumentType = "order" | "purchaseOrder" | "productionOrder" | "invoiceOut" | "invoiceIn";

const PRINT_PATH: Record<DocumentType, string> = {
  order: "orders",
  purchaseOrder: "purchase-orders",
  productionOrder: "production-orders",
  invoiceOut: "invoices-out",
  invoiceIn: "invoices-in",
};

// Block M5: invoices get the legal-entity override (they have their own
// legalEntityId, like Order/PurchaseOrder) but not the labels tab — that
// exists for orders/POs as the moment of physical shipping/receiving (Block
// M4); an invoice is a pure billing document with no such moment.
const LEGAL_ENTITY_TYPES = new Set<DocumentType>(["order", "purchaseOrder", "invoiceOut", "invoiceIn"]);
const LABEL_TYPES = new Set<DocumentType>(["order", "purchaseOrder"]);

const LABEL_MODE_ITEMS = { unit: "На каждую единицу", line: "По позициям" };

interface PrintDialogProps {
  documentType: DocumentType;
  orgSlug: string;
  documentId: string;
  /** Empty for productionOrder callers — no legal-entity override there
   * (ProductionOrder has no legalEntityId of its own to override). */
  legalEntities?: { id: string; name: string }[];
  currentLegalEntityId?: string | null;
  /** Block M4 phase B — this employee's personal preference (Employee.
   * openPdfInBrowser, self-service in /settings/profile): true opens the
   * server-rendered PDF inline in a new tab, false forces a save-as
   * download. Purely which behavior the "Скачать PDF" button uses, not a
   * capability check — both are always available. */
  openPdfInBrowser?: boolean;
}

/**
 * Block M4 — Phase A replaced the old plain PrintButton link with a dialog
 * offering per-printout overrides (legal entity, show/hide prices) plus a
 * labels tab for barcode labels on this document's line items; those
 * buttons still just open the existing browser-print HTML pages in a new
 * tab, letting the caller's own browser handle Ctrl+P.
 *
 * Phase B adds "Скачать PDF" next to it — same query-param URL, but routed
 * through `/api/print/pdf` (src/app/api/print/pdf/route.ts), which renders
 * that exact page server-side via a headless Chromium and returns an actual
 * PDF file instead of an HTML page. Both buttons stay available side by
 * side; `openPdfInBrowser` only decides whether that PDF opens inline
 * (target="_blank") or downloads straight to disk.
 */
export function PrintDialog({
  documentType,
  orgSlug,
  documentId,
  legalEntities = [],
  currentLegalEntityId = null,
  openPdfInBrowser = false,
}: PrintDialogProps) {
  const [open, setOpen] = useState(false);
  const [legalEntityId, setLegalEntityId] = useState<string | null>(currentLegalEntityId);
  const [showPrices, setShowPrices] = useState(true);
  const [labelMode, setLabelMode] = useState<"unit" | "line">("unit");

  const basePath = `/print/${PRINT_PATH[documentType]}/${orgSlug}/${documentId}`;
  const supportsLegalEntity = LEGAL_ENTITY_TYPES.has(documentType);
  const supportsLabels = LABEL_TYPES.has(documentType);

  const docHref = (() => {
    const qs = new URLSearchParams();
    if (supportsLegalEntity && legalEntityId) qs.set("legalEntityId", legalEntityId);
    if (!showPrices) qs.set("prices", "0");
    const query = qs.toString();
    return query ? `${basePath}?${query}` : basePath;
  })();

  const labelsHref = (() => {
    const qs = new URLSearchParams();
    qs.set("mode", labelMode);
    if (!showPrices) qs.set("prices", "0");
    return `${basePath}/labels?${qs.toString()}`;
  })();

  const pdfHref = (path: string) => `/api/print/pdf?path=${encodeURIComponent(path)}`;

  const legalEntityItems = Object.fromEntries(legalEntities.map((e) => [e.id, e.name]));

  const priceCheckbox = (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={showPrices} onCheckedChange={(checked) => setShowPrices(checked === true)} />
      Показывать цены
    </label>
  );

  const formSection = (
    <div className="flex flex-col gap-4 px-4 pb-4">
      {supportsLegalEntity && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Юрлицо</span>
          <Select value={legalEntityId} items={legalEntityItems} onValueChange={setLegalEntityId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="По умолчанию" />
            </SelectTrigger>
            <SelectContent>
              {legalEntities.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {priceCheckbox}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          render={<a href={docHref} target="_blank" rel="noopener" />}
          onClick={() => setOpen(false)}
        >
          Открыть для печати
        </Button>
        <Button
          type="button"
          className="flex-1"
          render={
            <a
              href={pdfHref(docHref)}
              target={openPdfInBrowser ? "_blank" : undefined}
              download={openPdfInBrowser ? undefined : true}
              rel="noopener"
            />
          }
          onClick={() => setOpen(false)}
        >
          Скачать PDF
        </Button>
      </div>
    </div>
  );

  const labelsSection = (
    <div className="flex flex-col gap-4 px-4 pb-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Количество этикеток</span>
        <Select
          value={labelMode}
          items={LABEL_MODE_ITEMS}
          onValueChange={(v) => setLabelMode(v === "line" ? "line" : "unit")}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unit">На каждую единицу</SelectItem>
            <SelectItem value="line">По позициям</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {priceCheckbox}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          render={<a href={labelsHref} target="_blank" rel="noopener" />}
          onClick={() => setOpen(false)}
        >
          Открыть для печати
        </Button>
        <Button
          type="button"
          className="flex-1"
          render={
            <a
              href={pdfHref(labelsHref)}
              target={openPdfInBrowser ? "_blank" : undefined}
              download={openPdfInBrowser ? undefined : true}
              rel="noopener"
            />
          }
          onClick={() => setOpen(false)}
        >
          Скачать PDF
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Printer className="size-4" />
        Печать
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Печать</DialogTitle>
        </DialogHeader>
        {supportsLabels ? (
          <Tabs defaultValue="form">
            <TabsList className="mx-4">
              <TabsTrigger value="form">Печатная форма</TabsTrigger>
              <TabsTrigger value="labels">Этикетки</TabsTrigger>
            </TabsList>
            <TabsContent value="form">{formSection}</TabsContent>
            <TabsContent value="labels">{labelsSection}</TabsContent>
          </Tabs>
        ) : (
          formSection
        )}
      </DialogContent>
    </Dialog>
  );
}
