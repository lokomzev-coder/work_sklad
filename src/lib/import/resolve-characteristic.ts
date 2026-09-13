import { prisma } from "@/lib/prisma";

// Block J: find-or-create a Characteristic by exact name, for variant rows'
// "Характеристика:<Имя>" columns. Same case-sensitive, catch-and-refetch
// pattern as resolve-unit.ts and the existing
// characteristics.ts::createCharacteristic (which relies on the same
// @@unique([orgId, name]) constraint already on this model).
export async function findOrCreateCharacteristicByName(
  orgId: string,
  name: string,
  cache: Map<string, string>,
): Promise<string> {
  const trimmed = name.trim();
  if (cache.has(trimmed)) return cache.get(trimmed)!;

  let characteristic = await prisma.characteristic.findFirst({ where: { orgId, name: trimmed } });
  if (!characteristic) {
    try {
      characteristic = await prisma.characteristic.create({ data: { orgId, name: trimmed } });
    } catch {
      characteristic = await prisma.characteristic.findFirst({ where: { orgId, name: trimmed } });
      if (!characteristic) throw new Error(`Не удалось создать характеристику «${trimmed}»`);
    }
  }

  cache.set(trimmed, characteristic.id);
  return characteristic.id;
}
