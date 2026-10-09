"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createDefaultLabelTemplate } from "@/actions/label-templates";

/** Block W — quick-start button next to the blank-canvas constructor:
 * creates the "Основной (артикул + штрихкод)" template in one click, then
 * takes the admin straight to it for further editing (size, elements). */
export function CreateDefaultLabelTemplateButton({ orgSlug }: { orgSlug: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await createDefaultLabelTemplate(orgSlug);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Основной шаблон создан");
      router.push(`/${orgSlug}/catalog/label-templates/${result.id}`);
    });
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick} disabled={isPending}>
      {isPending ? "Создаём..." : "Создать основной шаблон (артикул + штрихкод)"}
    </Button>
  );
}
