// Block J: the column-mapping wizard step maps each file column to one of
// these. Scoped strictly to fields that already exist on CatalogItem today
// (no cost price/VAT/weight/volume — see ROADMAP.md's Block J scope cuts).
// "sku" doubles as МойСклад's separate "Код" and "Артикул" fields — this
// schema only has one field for both, documented in the UI mapping hint so
// it isn't mistaken for a missing feature.
export interface TargetFieldDef {
  key: string;
  label: string;
  required: boolean;
  // Extra exact-match header names autoDetectMapping() also accepts besides
  // `label` itself — still exact-match only, just against a wider alias set,
  // since a real file is more likely to use a plain short header ("Тип",
  // "Артикул") than this UI's fuller display label. Found live: with only
  // `label` considered, a file's "Тип"/"Артикул" columns went unmapped even
  // though the fields obviously exist.
  aliases?: string[];
}

export const TARGET_FIELDS: readonly TargetFieldDef[] = [
  { key: "name", label: "Наименование", required: true },
  { key: "type", label: "Тип (Товар/Услуга/Комплект/Модификация)", required: false, aliases: ["Тип"] },
  { key: "sku", label: "Код/Артикул", required: false, aliases: ["Код", "Артикул"] },
  { key: "barcode", label: "Штрихкод", required: false },
  { key: "unitPrice", label: "Цена продажи", required: true, aliases: ["Цена"] },
  { key: "currency", label: "Валюта", required: false },
  { key: "groupPath", label: "Группы", required: false, aliases: ["Группа"] },
  { key: "unitName", label: "Единица измерения", required: false, aliases: ["Ед. изм.", "Единица"] },
  { key: "parentSku", label: "Код товара модификации", required: false },
];

export const CHARACTERISTIC_COLUMN_PREFIX = "Характеристика:";

// A column literally named "Характеристика:Цвет" auto-registers as its own
// target field — never offered as a manually-picked option in TARGET_FIELDS,
// only ever produced by detectCharacteristicColumns() below. Deliberately
// NOT trying to guess this from anything other than the exact prefix — see
// the ROADMAP.md note on МойСклад's own confirmed unreliable header-name
// autodetection (a "Группа" column wasn't picked up even on exact match).
export function detectCharacteristicColumns(headers: string[]): { header: string; characteristicName: string }[] {
  return headers
    .filter((h) => h.startsWith(CHARACTERISTIC_COLUMN_PREFIX))
    .map((h) => ({ header: h, characteristicName: h.slice(CHARACTERISTIC_COLUMN_PREFIX.length).trim() }))
    .filter((c) => c.characteristicName.length > 0);
}

// Exact, case-insensitive, trimmed match only — no fuzzy/partial matching.
// Confirmed live against МойСклад's own wizard that autodetection is
// unreliable even on an exact-looking match, so this project doesn't try to
// be cleverer than that: it offers a best-effort default the user must
// still review on the mapping step, never a silent guess.
export function autoDetectMapping(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const header of headers) {
    const charColumn = detectCharacteristicColumns([header])[0];
    if (charColumn) {
      mapping[header] = header; // dynamic field key === the header itself
      continue;
    }
    const normalizedHeader = header.trim().toLowerCase();
    const match = TARGET_FIELDS.find(
      (f) =>
        f.label.trim().toLowerCase() === normalizedHeader ||
        f.aliases?.some((alias) => alias.trim().toLowerCase() === normalizedHeader),
    );
    mapping[header] = match?.key ?? null;
  }
  return mapping;
}
