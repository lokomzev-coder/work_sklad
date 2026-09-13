"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlatformRoleForm } from "@/components/admin/platform-role-form";
import type { PlatformCapability } from "@/lib/platform-auth";

export function CreatePlatformRoleInline({ capabilities }: { capabilities: PlatformCapability[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Создать роль
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <PlatformRoleForm capabilities={capabilities} onDone={() => setOpen(false)} />
      </CardContent>
    </Card>
  );
}
