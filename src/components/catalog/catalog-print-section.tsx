"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { ArchiveRowActions } from "@/components/data-table/archive-row-actions";
import { CatalogPrintMenu } from "@/components/catalog/catalog-print-menu";
import { formatMoney } from "@/lib/format";
import type { EntityStatusFilter } from "@/components/data-table/archivable-entity-table";
import type { ArchiveOrDeleteResult } from "@/lib/archive";

const TYPE_LABEL: Record<string, string> = {
  PRODUCT: "Товар",
  SERVICE: "Услуга",
  BUNDLE: "Комплект",
};

export interface CatalogRow {
  id: string;
  name: string;
  type: string;
  sku: string | null;
  groupName: string | null;
  unitPrice: number;
  currency: string;
  status: EntityStatusFilter;
}

interface CatalogPrintSectionProps {
  orgSlug: string;
  activeTab: EntityStatusFilter;
  rows: CatalogRow[];
  canEdit: boolean;
  templates: { id: string; name: string }[];
  openPdfInBrowser: boolean;
  onArchive: (id: string) => Promise<void>;
  onRestore: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<ArchiveOrDeleteResult>;
}

/**
 * Block R phase 3 — replaces the plain server-rendered ArchivableEntityTable
 * on the catalog list with a selectable variant (same row-selection idea as
 * OrdersSelectableTable, Block M3's picking-wave flow) PLUS the "Печать"
 * dropdown (CatalogPrintMenu) — both need to share selection state, which
 * is why they live in one client component instead of a server-rendered
 * table next to a separately-stateful button.
 */
export function CatalogPrintSection({
  orgSlug,
  activeTab,
  rows,
  canEdit,
  templates,
  openPdfInBrowser,
  onArchive,
  onRestore,
  onDelete,
}: CatalogPrintSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <CatalogPrintMenu
          orgSlug={orgSlug}
          selectedItemIds={[...selected]}
          allItemIds={rows.map((r) => r.id)}
          templates={templates}
          openPdfInBrowser={openPdfInBrowser}
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={rows.length > 0 && selected.size === rows.length}
                  onCheckedChange={(checked) => toggleAll(checked === true)}
                />
              </TableHead>
              <TableHead>Название</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Артикул</TableHead>
              <TableHead>Группа</TableHead>
              <TableHead>Цена</TableHead>
              {canEdit && <TableHead className="w-0" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canEdit ? 7 : 6} className="text-center text-muted-foreground">
                  {activeTab === "ACTIVE" ? "Каталог пуст" : "В архиве пусто"}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const href = canEdit ? `/${orgSlug}/catalog/${row.id}` : undefined;
                const cell = (children: React.ReactNode) =>
                  href ? (
                    <Link href={href} className="block">
                      {children}
                    </Link>
                  ) : (
                    children
                  );
                return (
                  <TableRow key={row.id}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(checked) => toggle(row.id, checked === true)}
                      />
                    </TableCell>
                    <TableCell>{cell(row.name)}</TableCell>
                    <TableCell>{cell(<Badge variant="secondary">{TYPE_LABEL[row.type]}</Badge>)}</TableCell>
                    <TableCell>{cell(row.sku ?? "—")}</TableCell>
                    <TableCell>{cell(row.groupName ?? "—")}</TableCell>
                    <TableCell>{cell(formatMoney(row.unitPrice, row.currency))}</TableCell>
                    {canEdit && (
                      <TableCell className="text-right">
                        <ArchiveRowActions
                          status={row.status}
                          onArchive={() => onArchive(row.id)}
                          onRestore={() => onRestore(row.id)}
                          onDelete={() => onDelete(row.id)}
                          deleteTitle="Удалить позицию каталога?"
                        />
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
