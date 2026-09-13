import { prisma } from "@/lib/prisma";

// Block J: find-or-create a Unit by exact name. Case-sensitive, deliberately
// not normalized — matches the existing @@unique([orgId, name]) constraint's
// own behavior (Postgres unique index is case-sensitive by default), so
// "шт" and "Шт" really do create two distinct units. Not a silent gap: the
// alternative (normalizing case here but not in the rest of the app, e.g.
// the manual "create unit" form) would make import behave differently from
// everywhere else a Unit gets created.
export async function findOrCreateUnitByName(
  orgId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const trimmed = name.trim();
  if (cache.has(trimmed)) return cache.get(trimmed)!;

  let unit = await prisma.unit.findFirst({ where: { orgId, name: trimmed } });
  if (!unit) {
    try {
      // No separate short-name column in the import format — the sheet only
      // ever gives one name, so it doubles as both.
      unit = await prisma.unit.create({ data: { orgId, name: trimmed, shortName: trimmed } });
    } catch {
      unit = await prisma.unit.findFirst({ where: { orgId, name: trimmed } });
      if (!unit) throw new Error(`Не удалось создать единицу измерения «${trimmed}»`);
    }
  }

  cache.set(trimmed, unit.id);
  return unit.id;
}
