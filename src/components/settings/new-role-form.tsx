"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { createCustomRole } from "@/actions/custom-roles";

export function NewRoleForm({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    const formData = new FormData();
    formData.set("name", name.trim());
    startTransition(async () => {
      const result = await createCustomRole(orgSlug, {}, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.push(`/${orgSlug}/settings/roles/${result.roleId}`);
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <Label htmlFor="role-name">Название роли</Label>
        <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
      </CardContent>
      <CardFooter>
        <Button type="button" disabled={isPending || !name.trim()} onClick={handleCreate}>
          {isPending ? "Создание..." : "Создать и настроить права"}
        </Button>
      </CardFooter>
    </Card>
  );
}
