"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { upsertProcessingStage } from "@/actions/processing-stages";

interface ProcessingStageFormProps {
  orgSlug: string;
  processingStageId: string | null;
  defaultValues?: {
    name: string;
    standardHourCost: string;
  };
}

export function ProcessingStageForm({ orgSlug, processingStageId, defaultValues }: ProcessingStageFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [standardHourCost, setStandardHourCost] = useState(defaultValues?.standardHourCost ?? "");

  function handleSubmit() {
    setError(null);
    if (!name.trim()) {
      setError("Введите название");
      return;
    }
    const parsedCost = standardHourCost.trim() === "" ? null : Number(standardHourCost);
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setError("Стоимость часа не может быть отрицательной");
      return;
    }

    startTransition(async () => {
      const result = await upsertProcessingStage(orgSlug, processingStageId, {
        name,
        standardHourCost: parsedCost,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push(`/${orgSlug}/production/stages`);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Этап производства</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>Название</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, Замес" />
        </div>
        <div className="flex flex-col gap-2">
          <Label>Стоимость часа (опционально)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="0"
            value={standardHourCost}
            onChange={(e) => setStandardHourCost(e.target.value)}
          />
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button onClick={handleSubmit} disabled={isPending}>
          {processingStageId ? "Сохранить" : "Создать этап"}
        </Button>
      </CardFooter>
    </Card>
  );
}
