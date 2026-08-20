"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { revealVaultSecret } from "@/actions/vault";

interface RevealSecretButtonProps {
  orgSlug: string;
  entryId: string;
}

export function RevealSecretButton({ orgSlug, entryId }: RevealSecretButtonProps) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleReveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealVaultSecret(orgSlug, entryId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSecret(result.secret ?? "");
    });
  }

  if (secret !== null) {
    return (
      <div className="flex items-center gap-2">
        <code className="select-all rounded bg-muted px-2 py-1 text-sm">
          {secret}
        </code>
        <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
          Скрыть
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleReveal}
        disabled={isPending}
      >
        {isPending ? "Расшифровка..." : "Показать пароль"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
