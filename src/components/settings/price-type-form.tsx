"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ActionResult } from "@/actions/price-types";

const initialState: ActionResult = {};

interface PriceTypeFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
}

export function PriceTypeForm({ orgSlug, action }: PriceTypeFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" placeholder="Оптовая" required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="isDefault" />
            Использовать по умолчанию
          </label>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Создать"}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/settings/price-types`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
