interface VariantValueLike {
  value: string;
  characteristic: { name: string };
}

/** Renders a variant's characteristic values as "Размер: L, Цвет: Красный". */
export function variantLabel(values: VariantValueLike[]): string {
  return values.map((v) => `${v.characteristic.name}: ${v.value}`).join(", ");
}
