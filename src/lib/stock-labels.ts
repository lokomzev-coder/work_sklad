/** Pure data, no Prisma import — safe to use from Client Components (e.g.
 * components/charts/stock-activity-chart.tsx). lib/stock.ts re-exports this
 * for server-side callers; importing Prisma Client into a client bundle
 * (as lib/stock.ts does) breaks Turbopack's client compile for that route. */
export const STOCK_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  ENTER: "Оприходование",
  LOSS: "Списание",
  MOVE: "Перемещение",
  INVENTORY: "Инвентаризация",
  DEMAND: "Отгрузка",
  SUPPLY: "Приёмка",
  SALES_RETURN: "Возврат от клиента",
  PURCHASE_RETURN: "Возврат поставщику",
  PRODUCTION_CONSUME: "Расход в производство",
  PRODUCTION_OUTPUT: "Выпуск продукции",
};
