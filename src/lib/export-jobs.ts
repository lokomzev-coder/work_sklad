import { prisma, withDbRetry } from "@/lib/prisma";
import { getDelegate, projectRow, type ApiEntityConfig } from "@/lib/api-registry";
import { toJsonSafe } from "@/lib/json-safe";

/**
 * МойСклад's `?async=true` export, adapted to this project's no-worker
 * convention (same shape as registerFiscalReceipt in Block E/M3): create a
 * PENDING row, process it immediately in a fire-and-forget background task,
 * let the caller poll GET /api/v1/export/{id} until it flips to DONE/FAILED.
 * There's no real queue behind this — for this project's scale, "run it
 * right away in the background" and "run it later from a queue" produce the
 * same externally-visible behavior, so a real job queue would be
 * unjustified complexity, not a missing feature.
 *
 * Unlike the paginated list endpoint, this exports ALL rows matching the
 * filter/search/order (no limit/offset) — that's the whole point of an
 * export vs. a page of results.
 */
export function startExportJob(
  orgId: string,
  entityType: string,
  config: ApiEntityConfig,
  query: { where?: Record<string, unknown>; orderBy?: unknown; include?: Record<string, unknown> },
  queryString: string,
): Promise<{ id: string }> {
  return prisma.exportJob
    .create({
      data: { orgId, entityType, query: queryString, status: "PENDING" },
      select: { id: true },
    })
    .then((job) => {
      void (async () => {
        try {
          const delegate = getDelegate(config);
          const rows = await withDbRetry(() =>
            delegate.findMany({
              where: { orgId, ...query.where },
              orderBy: query.orderBy,
              include: query.include,
            }),
          );
          const projected = rows.map((row) => projectRow(row, config));
          await prisma.exportJob.update({
            where: { id: job.id },
            data: { status: "DONE", result: toJsonSafe(projected) as never, completedAt: new Date() },
          });
        } catch (err) {
          await prisma.exportJob.update({
            where: { id: job.id },
            data: {
              status: "FAILED",
              error: err instanceof Error ? err.message : "Не удалось выполнить экспорт",
              completedAt: new Date(),
            },
          }).catch(() => {
            // job row itself may be gone in a race with something else — nothing more to do
          });
        }
      })();
      return job;
    });
}
