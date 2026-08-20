"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ActionResult } from "@/actions/clients";

const initialState: ActionResult = {};

interface ClientFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  defaultValues?: {
    name: string;
    inn: string | null;
    email: string | null;
    phone: string | null;
  };
  submitLabel: string;
}

export function ClientForm({
  orgSlug,
  action,
  defaultValues,
  submitLabel,
}: ClientFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Название / имя</Label>
            <Input
              id="name"
              name="name"
              defaultValue={defaultValues?.name}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="inn">ИНН</Label>
            <Input id="inn" name="inn" defaultValue={defaultValues?.inn ?? ""} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={defaultValues?.email ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Телефон</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={defaultValues?.phone ?? ""}
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
            render={<Link href={`/${orgSlug}/clients`} />}
          >
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
