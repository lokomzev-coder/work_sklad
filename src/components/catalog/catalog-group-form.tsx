"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActionResult } from "@/actions/catalog-groups";

const initialState: ActionResult = {};

const NONE_VALUE = "__none__";

interface CatalogGroupFormProps {
  orgSlug: string;
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  parentOptions: { id: string; label: string }[];
  defaultValues?: { name: string; parentId: string | null };
  submitLabel: string;
}

export function CatalogGroupForm({
  orgSlug,
  action,
  parentOptions,
  defaultValues,
  submitLabel,
}: CatalogGroupFormProps) {
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
            <Label htmlFor="parentId">Родительская группа</Label>
            <Select
              name="parentId"
              items={{
                [NONE_VALUE]: "Без родителя (корневая группа)",
                ...Object.fromEntries(parentOptions.map((o) => [o.id, o.label])),
              }}
              defaultValue={defaultValues?.parentId ?? NONE_VALUE}
            >
              <SelectTrigger id="parentId" className="w-full">
                <SelectValue placeholder="Без родителя (корневая группа)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  Без родителя (корневая группа)
                </SelectItem>
                {parentOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            render={<Link href={`/${orgSlug}/catalog/groups`} />}
          >
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
