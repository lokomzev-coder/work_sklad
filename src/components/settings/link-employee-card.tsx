"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EntityCombobox } from "@/components/forms/entity-combobox";
import { linkMyEmployee } from "@/actions/profile";

interface LinkEmployeeCardProps {
  orgSlug: string;
  unlinkedEmployees: { value: string; label: string }[];
}

/**
 * Block W (explicit request, 2026-09-22) — shown only when ctx.employeeId is
 * null (rendered by the profile page). Explains what "привязка к
 * сотруднику" actually means and fixes it in one click, instead of leaving
 * the person stuck reading an error about it with no way to act.
 */
export function LinkEmployeeCard({ orgSlug, unlinkedEmployees }: LinkEmployeeCardProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLink(existingEmployeeId: string | null) {
    startTransition(async () => {
      const result = await linkMyEmployee(orgSlug, existingEmployeeId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Аккаунт привязан к карточке сотрудника");
      router.refresh();
    });
  }

  return (
    <Card className="border-amber-400">
      <CardHeader>
        <CardTitle>Аккаунт не привязан к сотруднику</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          Загрузка файлов, задачи, кассовые ордера и некоторые другие действия записываются на карточку
          конкретного сотрудника — так видно, кто именно что сделал. У этого входа пока нет такой карточки,
          поэтому эти действия недоступны.
        </p>
        {unlinkedEmployees.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">Привязать к уже существующей карточке сотрудника:</p>
            <div className="flex flex-wrap items-center gap-2">
              <EntityCombobox
                className="w-56"
                options={unlinkedEmployees}
                value={selected}
                onChange={setSelected}
                placeholder="Выберите сотрудника"
                emptyMessage="Не найдено"
              />
              <Button type="button" size="sm" disabled={!selected || isPending} onClick={() => handleLink(selected)}>
                Привязать
              </Button>
            </div>
          </div>
        )}
        <div>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => handleLink(null)}>
            {isPending ? "Создаём..." : "Создать новую карточку сотрудника и привязать"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
