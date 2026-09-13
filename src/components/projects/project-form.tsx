"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { EntityCombobox, type ComboboxOption } from "@/components/forms/entity-combobox";
import { ClientCombobox } from "@/components/forms/client-combobox";
import { upsertProject } from "@/actions/projects";

interface ProjectFormProps {
  orgSlug: string;
  projectId: string | null;
  clientOptions: ComboboxOption[];
  employeeOptions: ComboboxOption[];
  defaultValues?: {
    name: string;
    clientId: string | null;
    responsibleEmployeeId: string | null;
    startDate: string | null;
    endDate: string | null;
    budget: string | null;
  };
}

export function ProjectForm({
  orgSlug,
  projectId,
  clientOptions,
  employeeOptions,
  defaultValues,
}: ProjectFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [clientId, setClientId] = useState<string | null>(defaultValues?.clientId ?? null);
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState<string | null>(
    defaultValues?.responsibleEmployeeId ?? null,
  );
  const [startDate, setStartDate] = useState(defaultValues?.startDate ?? "");
  const [endDate, setEndDate] = useState(defaultValues?.endDate ?? "");
  const [budget, setBudget] = useState(defaultValues?.budget ?? "");

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Введите название");
      return;
    }

    startTransition(async () => {
      const result = await upsertProject(orgSlug, projectId, {
        name,
        clientId,
        responsibleEmployeeId,
        startDate: startDate || null,
        endDate: endDate || null,
        budget: budget ? Number(budget) : null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/projects`);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label>Название</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Клиент</Label>
          <ClientCombobox
            orgSlug={orgSlug}
            options={clientOptions}
            value={clientId}
            onChange={setClientId}
            placeholder="Не указан"
            emptyMessage="Клиенты не найдены"
            createLabel="клиента"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Ответственный сотрудник</Label>
          <EntityCombobox
            options={employeeOptions}
            value={responsibleEmployeeId}
            onChange={setResponsibleEmployeeId}
            placeholder="Не выбран"
            emptyMessage="Сотрудники не найдены"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Дата начала</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Дата окончания</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label>Бюджет</Label>
          <Input type="number" min="0" step="0.01" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter className="flex gap-2">
        <Button type="button" onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Сохранение..." : "Сохранить"}
        </Button>
        <Button variant="outline" render={<Link href={`/${orgSlug}/projects`} />}>
          Отмена
        </Button>
      </CardFooter>
    </Card>
  );
}
