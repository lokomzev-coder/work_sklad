"use client";

import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { createClientContact, deleteClientContact, type ActionResult } from "@/actions/client-contacts";

const initialState: ActionResult = {};

export interface ClientContactRow {
  id: string;
  name: string;
  position: string | null;
  phone: string | null;
  email: string | null;
}

interface ClientContactsSectionProps {
  orgSlug: string;
  clientId: string;
  contacts: ClientContactRow[];
}

export function ClientContactsSection({
  orgSlug,
  clientId,
  contacts,
}: ClientContactsSectionProps) {
  const boundAction = createClientContact.bind(null, orgSlug, clientId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [, startTransition] = useTransition();

  function handleDelete(contactId: string) {
    startTransition(async () => {
      await deleteClientContact(orgSlug, clientId, contactId);
      toast.success("Контакт удалён");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Контактные лица</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {contacts.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Должность</TableHead>
                  <TableHead>Телефон</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.position ?? "—"}</TableCell>
                    <TableCell>{c.phone ?? "—"}</TableCell>
                    <TableCell>{c.email ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(c.id)}
                      >
                        Удалить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <form action={formAction} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-name">Имя</Label>
            <Input id="contact-name" name="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-position">Должность</Label>
            <Input id="contact-position" name="position" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-phone">Телефон</Label>
            <Input id="contact-phone" name="phone" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" name="email" type="email" />
          </div>
          {state.error && (
            <p className="sm:col-span-2 text-sm text-destructive">{state.error}</p>
          )}
          <CardFooter className="p-0 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Добавляем..." : "Добавить контакт"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
