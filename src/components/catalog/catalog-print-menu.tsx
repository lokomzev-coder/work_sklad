"use client";

import { useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { SimpleDeleteButton } from "@/components/data-table/simple-delete-button";
import { CatalogLabelPrintDialog } from "@/components/catalog/catalog-label-print-dialog";
import { deleteLabelTemplate } from "@/actions/label-templates";

interface CatalogPrintMenuProps {
  orgSlug: string;
  selectedItemIds: string[];
  allItemIds: string[];
  templates: { id: string; name: string }[];
  openPdfInBrowser?: boolean;
}

/**
 * Block R phase 3 — entry point on the catalog list, exactly the path the
 * user described: "Товары и услуги → Печать → Настроить → Открыть
 * конструктор этикеток". "Печать этикеток" prints the checked rows (or
 * every visible row if nothing's checked — bulk-printing the whole list is
 * a reasonable default, not an error state). "Настроить печать" lists
 * existing templates (edit/delete) with the constructor link.
 */
export function CatalogPrintMenu({
  orgSlug,
  selectedItemIds,
  allItemIds,
  templates,
  openPdfInBrowser = false,
}: CatalogPrintMenuProps) {
  const [printOpen, setPrintOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const printItemIds = selectedItemIds.length > 0 ? selectedItemIds : allItemIds;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button type="button" variant="outline" size="sm">
              <Printer className="size-4" />
              Печать
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setPrintOpen(true)} disabled={printItemIds.length === 0}>
            Печать этикеток{selectedItemIds.length > 0 ? ` (${selectedItemIds.length})` : ""}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>Настроить печать</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CatalogLabelPrintDialog
        orgSlug={orgSlug}
        itemIds={printItemIds}
        templates={templates}
        openPdfInBrowser={openPdfInBrowser}
        trigger={null}
        open={printOpen}
        onOpenChange={setPrintOpen}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Настроить печать</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            {templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Шаблонов этикеток пока нет.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableBody>
                    {templates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.name}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/${orgSlug}/catalog/label-templates/${t.id}`} className="text-sm underline">
                            Редактировать
                          </Link>
                        </TableCell>
                        <TableCell className="w-0">
                          <SimpleDeleteButton
                            onDelete={() => deleteLabelTemplate(orgSlug, t.id)}
                            title="Удалить шаблон этикетки?"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            <Button type="button" render={<Link href={`/${orgSlug}/catalog/label-templates/new`} />}>
              Открыть конструктор этикеток
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
