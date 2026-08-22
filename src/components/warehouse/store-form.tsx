"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ActionResult } from "@/actions/stores";

const initialState: ActionResult = {};

interface StoreFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: { name: string; address: string | null };
  submitLabel: string;
}

export function StoreForm({
  orgSlug,
  action,
  defaultValues,
  submitLabel,
}: StoreFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Название</Label>
            <Input
              id="name"
              name="name"
              defaultValue={defaultValues?.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Адрес</Label>
            <Input
              id="address"
              name="address"
              defaultValue={defaultValues?.address ?? ""}
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : submitLabel}
          </Button>
          <Button
            variant="outline"
            render={<Link href={`/${orgSlug}/warehouse/stores`} />}
          >
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
