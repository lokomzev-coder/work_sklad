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
import { createClientAddress, deleteClientAddress, type ActionResult } from "@/actions/client-addresses";

const initialState: ActionResult = {};

export interface ClientAddressRow {
  id: string;
  label: string | null;
  address: string;
}

interface ClientAddressesSectionProps {
  orgSlug: string;
  clientId: string;
  addresses: ClientAddressRow[];
}

export function ClientAddressesSection({
  orgSlug,
  clientId,
  addresses,
}: ClientAddressesSectionProps) {
  const boundAction = createClientAddress.bind(null, orgSlug, clientId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [, startTransition] = useTransition();

  function handleDelete(addressId: string) {
    startTransition(async () => {
      await deleteClientAddress(orgSlug, clientId, addressId);
      toast.success("Адрес удалён");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Адреса</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {addresses.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Метка</TableHead>
                  <TableHead>Адрес</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {addresses.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.label ?? "—"}</TableCell>
                    <TableCell>{a.address}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(a.id)}
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
            <Label htmlFor="address-label">Метка</Label>
            <Input id="address-label" name="label" placeholder="Юридический, Склад..." />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address-address">Адрес</Label>
            <Input id="address-address" name="address" required />
          </div>
          {state.error && (
            <p className="sm:col-span-2 text-sm text-destructive">{state.error}</p>
          )}
          <CardFooter className="p-0 sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Добавляем..." : "Добавить адрес"}
            </Button>
          </CardFooter>
        </form>
      </CardContent>
    </Card>
  );
}
