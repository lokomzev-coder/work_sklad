"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export interface LabelItem {
  name: string;
  barcode: string | null;
  price: string;
  currency: string;
  /** How many identical copies of this label to render — resolved by the
   * caller from the chosen quantity mode (per unit vs per line item). */
  copies: number;
}

interface PrintLabelsProps {
  title: string;
  items: LabelItem[];
  showPrices: boolean;
}

/**
 * Block M4 — Phase A. One barcode label per physical unit/line, always
 * encoded CODE128 (accepts arbitrary alphanumeric input, so we never try to
 * detect whether a stored barcode is "really" EAN13/EAN8/UPC). Items with no
 * barcode on file render name/price only — one missing barcode shouldn't
 * fail the whole batch.
 */
function Label({ item, showPrices }: { item: LabelItem; showPrices: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && item.barcode) {
      JsBarcode(svgRef.current, item.barcode, {
        format: "CODE128",
        displayValue: true,
        fontSize: 12,
        height: 32,
        margin: 4,
      });
    }
  }, [item.barcode]);

  return (
    <div className="flex flex-col items-center justify-center gap-1 break-inside-avoid border border-gray-300 p-2 text-center text-black">
      <div className="text-xs font-medium leading-tight">{item.name}</div>
      {item.barcode ? (
        <svg ref={svgRef} />
      ) : (
        <div className="text-[10px] text-gray-400">без штрихкода</div>
      )}
      {showPrices && <div className="text-sm font-semibold">{item.price} {item.currency}</div>}
    </div>
  );
}

export function PrintLabels({ title, items, showPrices }: PrintLabelsProps) {
  const expanded = items.flatMap((item, itemIndex) =>
    Array.from({ length: item.copies }, (_, copyIndex) => ({
      ...item,
      key: `${itemIndex}-${copyIndex}`,
    })),
  );

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          Печать / Сохранить PDF
        </button>
      </div>

      <h1 className="mb-4 text-xl font-semibold print:hidden">{title}</h1>

      {expanded.length === 0 ? (
        <p className="text-sm text-gray-500">Нет позиций для печати этикеток.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 print:grid-cols-3">
          {expanded.map((item) => (
            <Label key={item.key} item={item} showPrices={showPrices} />
          ))}
        </div>
      )}
    </div>
  );
}
