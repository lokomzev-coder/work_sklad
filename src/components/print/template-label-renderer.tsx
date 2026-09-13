"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { isValidEan13 } from "@/lib/barcode";
import type { LabelElement, LabelFieldKey } from "@/lib/label-template";

export interface LabelPrintItem {
  key: string;
  name: string;
  sku: string | null;
  price: string;
  barcode: string | null;
  copies: number;
}

interface TemplateLabelRendererProps {
  widthMm: number;
  heightMm: number;
  elements: LabelElement[];
  items: LabelPrintItem[];
}

function fieldValue(item: LabelPrintItem, field: LabelFieldKey): string {
  if (field === "name") return item.name;
  if (field === "sku") return item.sku ?? "—";
  if (field === "price") return item.price;
  return item.barcode ?? "—";
}

/**
 * Block R phase 3 — renders a LabelTemplate against real catalog item data
 * for printing. Coordinates are applied as raw `mm` CSS units (no scale
 * conversion — unlike the editor's px-per-mm canvas, this is the actual
 * printed page). Barcode elements follow the exact same "print-ready"
 * marker pattern print-labels.tsx established in Block M4
 * (`data-barcode`/`data-rendered`) so the existing `/api/print/pdf` route
 * needs zero changes to support this new page — it already waits for that
 * attribute on any `/print/**` page before calling `page.pdf()`.
 */
function BarcodeGraphic({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (svgRef.current && value && value !== "—") {
      JsBarcode(svgRef.current, value, {
        format: isValidEan13(value) ? "EAN13" : "CODE128",
        displayValue: false,
        margin: 0,
      });
      svgRef.current.dataset.rendered = "true";
    }
  }, [value]);
  return <svg ref={svgRef} data-barcode className="h-full w-full" preserveAspectRatio="none" />;
}

function Label({ widthMm, heightMm, elements, item }: { widthMm: number; heightMm: number; elements: LabelElement[]; item: LabelPrintItem }) {
  return (
    <div
      className="relative break-inside-avoid overflow-hidden border border-gray-300 bg-white text-black"
      style={{ width: `${widthMm}mm`, height: `${heightMm}mm` }}
    >
      {elements.map((el) => (
        <div
          key={el.id}
          className="absolute overflow-hidden"
          style={{
            left: `${el.x}mm`,
            top: `${el.y}mm`,
            width: `${el.width}mm`,
            height: `${el.height}mm`,
            fontSize: el.fontSize,
            fontWeight: el.bold ? 700 : 400,
          }}
        >
          {el.type === "barcode" ? (
            <BarcodeGraphic value={item.barcode ?? ""} />
          ) : el.type === "field" && el.field ? (
            fieldValue(item, el.field)
          ) : (
            el.text ?? ""
          )}
        </div>
      ))}
    </div>
  );
}

export function TemplateLabelRenderer({ widthMm, heightMm, elements, items }: TemplateLabelRendererProps) {
  const expanded = items.flatMap((item, itemIndex) =>
    Array.from({ length: item.copies }, (_, copyIndex) => ({ ...item, renderKey: `${itemIndex}-${copyIndex}` })),
  );

  return (
    <div className="mx-auto max-w-4xl bg-gray-100 p-8 print:bg-white print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Печать / Сохранить PDF
        </button>
      </div>
      {expanded.length === 0 ? (
        <p className="text-sm text-gray-500">Нет позиций для печати этикеток.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {expanded.map((item) => (
            <Label key={item.renderKey} widthMm={widthMm} heightMm={heightMm} elements={elements} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
