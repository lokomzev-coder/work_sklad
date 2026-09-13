"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import type { ActionResult } from "@/actions/tasks";

const initialState: ActionResult = {};

const EMPTY_VALUE = "__none__";

interface TaskFormProps {
  orgSlug: string;
  employees: { id: string; fullName: string }[];
  action: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
}

export function TaskForm({ orgSlug, employees, action }: TaskFormProps) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Название</Label>
            <Input id="title" name="title" placeholder="Позвонить клиенту" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Описание</Label>
            <Textarea id="description" name="description" rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dueDate">Срок</Label>
              <Input id="dueDate" name="dueDate" type="date" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="assignedEmployeeId">Исполнитель</Label>
              <Select name="assignedEmployeeId" defaultValue={EMPTY_VALUE} items={{ [EMPTY_VALUE]: "—", ...Object.fromEntries(employees.map((e) => [e.id, e.fullName])) }}>
                <SelectTrigger id="assignedEmployeeId" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_VALUE}>—</SelectItem>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Сохранение..." : "Создать"}
          </Button>
          <Button variant="outline" render={<Link href={`/${orgSlug}/tasks`} />}>
            Отмена
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
