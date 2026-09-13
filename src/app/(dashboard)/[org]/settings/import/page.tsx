import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { markAbandonedIfStale } from "@/actions/catalog-import";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ImportJobErrors } from "@/components/settings/import-job-errors";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  RUNNING: { label: "Выполняется", variant: "secondary" },
  COMPLETED: { label: "Завершён", variant: "default" },
  ABANDONED: { label: "Прерван", variant: "destructive" },
};

export default async function ImportHistoryPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "catalogImport", "view")) notFound();

  await markAbandonedIfStale(org);

  const jobs = await prisma.importJob.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      createdBy: { select: { name: true } },
      rows: {
        where: { success: false },
        select: { rowNumber: true, error: true, rawData: true },
        orderBy: { rowNumber: "asc" },
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="import" />
      <div>
        <h1 className="text-2xl font-semibold">Импорт из Excel — история</h1>
        <p className="text-sm text-muted-foreground">
          Прогоны импорта товаров из Excel/CSV, запущенные через каталог. Выполнение управляется браузером —
          если вкладка была закрыта до завершения, прогон помечается «Прерван».
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Дата</TableHead>
            <TableHead>Файл</TableHead>
            <TableHead>Автор</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Создано</TableHead>
            <TableHead>Обновлено</TableHead>
            <TableHead>Ошибок</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Пока не было ни одного импорта
              </TableCell>
            </TableRow>
          )}
          {jobs.map((job) => {
            const status = STATUS_LABEL[job.status];
            return (
              <TableRow key={job.id}>
                <TableCell>{job.startedAt.toLocaleString("ru-RU")}</TableCell>
                <TableCell className="font-medium">{job.fileName}</TableCell>
                <TableCell>{job.createdBy.name}</TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell>{job.createdCount}</TableCell>
                <TableCell>{job.updatedCount}</TableCell>
                <TableCell>
                  {job.errorCount > 0 ? (
                    <ImportJobErrors
                      rows={job.rows.map((r) => ({
                        rowNumber: r.rowNumber,
                        error: r.error ?? "",
                        rawData: (r.rawData as Record<string, unknown> | null) ?? null,
                      }))}
                    />
                  ) : (
                    "0"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
