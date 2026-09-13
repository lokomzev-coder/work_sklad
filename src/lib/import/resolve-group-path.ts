import { prisma } from "@/lib/prisma";
import type { CatalogGroup } from "@/generated/prisma/client";

// Block J: resolves (and auto-creates) a slash-delimited group path like
// "Сезонные/Ягоды", matching МойСклад's confirmed live behavior — a missing
// chain of groups gets created in full, one import run at a time.
//
// `cache` is scoped to a single processImportBatch() call, not the whole
// import — each batch may be a separate Server Action invocation (possibly
// a different serverless instance), so an in-memory Map can't be relied on
// across calls. It only dedupes repeated lookups for the same path *within*
// one batch; cross-batch/cross-import safety comes from the findFirst-
// before-create pattern below plus the @@unique([orgId, parentId, name])
// constraint added to CatalogGroup for this feature.
export async function findOrCreateGroupByPath(
  orgId: string,
  path: string,
  cache: Map<string, string>,
): Promise<string> {
  if (cache.has(path)) return cache.get(path)!;

  const segments = path
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  let parentId: string | null = null;
  let builtPath = "";
  for (const segment of segments) {
    builtPath = builtPath ? `${builtPath}/${segment}` : segment;
    const cached = cache.get(builtPath);
    if (cached) {
      parentId = cached;
      continue;
    }

    let group: CatalogGroup | null = await prisma.catalogGroup.findFirst({
      where: { orgId, name: segment, parentId },
    });
    if (!group) {
      try {
        group = await prisma.catalogGroup.create({
          data: { orgId, name: segment, parentId },
        });
      } catch {
        // Race: another row of this batch (or a concurrent import) created
        // the same segment first — the new @@unique constraint on
        // CatalogGroup is what makes this catch meaningful instead of a
        // silent duplicate.
        group = await prisma.catalogGroup.findFirst({
          where: { orgId, name: segment, parentId },
        });
        if (!group) throw new Error(`Не удалось создать группу «${segment}»`);
      }
    }

    cache.set(builtPath, group.id);
    parentId = group.id;
  }

  return parentId!;
}
