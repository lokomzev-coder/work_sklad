"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface CatalogLabelPrintDialogProps {
  orgSlug: string;
  itemIds: string[];
  templates: { id: string; name: string }[];
  /** Only meaningful for a single-item dialog (the catalog item card) — lets
   * the user print one specific packaging's own barcode instead of the
   * item's. Omitted from the catalog list's bulk dialog entirely. */
  packagingOptions?: { id: string; label: string }[];
  openPdfInBrowser?: boolean;
  /** Pass `null` to render no trigger at all (fully externally controlled
   * via `open`/`onOpenChange` — used by CatalogPrintMenu's dropdown item). */
  trigger?: React.ReactNode | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const NONE_PACKAGING = "__item__";

/**
 * Block R phase 3 — same two-button shape as PrintDialog (Block M4): one
 * link opens the plain HTML print page, the other routes through the
 * existing `/api/print/pdf` (Block M4, unchanged) for a real PDF. Not a
 * variant of PrintDialog itself — that component is document-scoped
 * (order/purchaseOrder/...), this one prints catalog item labels, which
 * aren't a "document" at all.
 */
export function CatalogLabelPrintDialog({
  orgSlug,
  itemIds,
  templates,
  packagingOptions = [],
  openPdfInBrowser = false,
  trigger,
  open: openProp,
  onOpenChange,
}: CatalogLabelPrintDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [templateId, setTemplateId] = useState<string | null>(templates[0]?.id ?? null);
  const [copies, setCopies] = useState("1");
  const [packagingId, setPackagingId] = useState<string>(NONE_PACKAGING);

  const templateItems = Object.fromEntries(templates.map((t) => [t.id, t.name]));
  const packagingItems = {
    [NONE_PACKAGING]: "Сам товар",
    ...Object.fromEntries(packagingOptions.map((p) => [p.id, p.label])),
  };

  const href = (() => {
    if (!templateId || itemIds.length === 0) return null;
    const qs = new URLSearchParams();
    qs.set("items", itemIds.join(","));
    qs.set("templateId", templateId);
    qs.set("copies", copies || "1");
    if (packagingId !== NONE_PACKAGING) qs.set("packagingId", packagingId);
    return `/print/catalog/${orgSlug}/labels?${qs.toString()}`;
  })();

  const pdfHref = href ? `/api/print/pdf?path=${encodeURIComponent(href)}` : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null &&
        (trigger ?? (
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={itemIds.length === 0}>
            <Printer className="size-4" />
            Печать этикеток
          </Button>
        ))}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Печать этикеток</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {templates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Нет ни одного шаблона этикеток — сначала создайте его в конструкторе (Товары и услуги → Печать →
              Настроить → Открыть конструктор этикеток).
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Шаблон</span>
                <Select value={templateId} items={templateItems} onValueChange={setTemplateId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выберите шаблон" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {packagingOptions.length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Печатать штрихкод</span>
                  <Select value={packagingId} items={packagingItems} onValueChange={(v) => setPackagingId(v ?? NONE_PACKAGING)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_PACKAGING}>Сам товар</SelectItem>
                      {packagingOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Label>Копий на позицию</Label>
                <Input type="number" min="1" value={copies} onChange={(e) => setCopies(e.target.value)} className="w-24" />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  render={href ? <a href={href} target="_blank" rel="noopener" /> : undefined}
                  disabled={!href}
                  onClick={() => setOpen(false)}
                >
                  Открыть для печати
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  render={
                    pdfHref ? (
                      <a
                        href={pdfHref}
                        target={openPdfInBrowser ? "_blank" : undefined}
                        download={openPdfInBrowser ? undefined : true}
                        rel="noopener"
                      />
                    ) : undefined
                  }
                  disabled={!pdfHref}
                  onClick={() => setOpen(false)}
                >
                  Скачать PDF
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
