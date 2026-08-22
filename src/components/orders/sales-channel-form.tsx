"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ActionResult } from "@/actions/sales-channels";

const initialState: ActionResult = {};

interface SalesChannelFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
}

export function SalesChannelForm({ orgSlug, action }: SalesChannelFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Название</Label>
            <Input id="name" name="name" placeholder="Розница" required />
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Создать"}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/orders/channels`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
