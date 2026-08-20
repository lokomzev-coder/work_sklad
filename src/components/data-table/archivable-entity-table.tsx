import Link from "next/link";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type EntityStatusFilter = "ACTIVE" | "ARCHIVED";

export interface ArchivableColumn<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface StatusTabsProps {
  basePath: string;
  active: EntityStatusFilter;
}

export function StatusTabs({ basePath, active }: StatusTabsProps) {
  const tabs: { value: EntityStatusFilter; label: string }[] = [
    { value: "ACTIVE", label: "Активные" },
    { value: "ARCHIVED", label: "Архив" },
  ];

  return (
    <div className="inline-flex w-fit rounded-md border bg-muted/40 p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={
            tab.value === "ACTIVE"
              ? basePath
              : `${basePath}?status=${tab.value}`
          }
          className={cn(
            "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
            active === tab.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

interface ArchivableEntityTableProps<T extends { id: string }> {
  data: T[];
  columns: ArchivableColumn<T>[];
  rowActions?: (row: T) => ReactNode;
  rowHref?: (row: T) => string;
  emptyMessage?: string;
}

export function ArchivableEntityTable<T extends { id: string }>({
  data,
  columns,
  rowActions,
  rowHref,
  emptyMessage = "Ничего не найдено",
}: ArchivableEntityTableProps<T>) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.header} className={col.className}>
                {col.header}
              </TableHead>
            ))}
            {rowActions && <TableHead className="w-0" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (rowActions ? 1 : 0)}
                className="text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row) => (
              <TableRow key={row.id}>
                {columns.map((col) => (
                  <TableCell key={col.header} className={col.className}>
                    {rowHref ? (
                      <Link href={rowHref(row)} className="block">
                        {col.cell(row)}
                      </Link>
                    ) : (
                      col.cell(row)
                    )}
                  </TableCell>
                ))}
                {rowActions && (
                  <TableCell className="text-right">
                    {rowActions(row)}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
