import { notFound } from "next/navigation";
import Link from "next/link";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { hasFeatureAccess, KNOWN_FEATURE_KEYS } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { LabelTemplateEditor } from "@/components/catalog/label-template-editor";
import { CreateDefaultLabelTemplateButton } from "@/components/catalog/create-default-label-template-button";

export default async function NewLabelTemplatePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "labelTemplates", "create")) notFound();

  // Block W (explicit request, 2026-09-22) — this used to only check the
  // ROLE permission above; a user with that permission but on a tariff
  // without labelTemplates could still open the constructor and only find
  // out on save, when upsertLabelTemplate's own assertFeatureEnabled threw
  // an unhandled error page. Checking here instead means they never get
  // into the constructor in the first place, with a normal in-app message.
  if (!hasFeatureAccess(ctx, KNOWN_FEATURE_KEYS.labelTemplates)) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Конструктор шаблонов этикеток не входит в текущий тариф организации.
        </p>
        <Button variant="outline" size="sm" render={<Link href={`/${org}/settings/subscription`} />}>
          Перейти к подписке
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Конструктор этикеток</h1>
        <CreateDefaultLabelTemplateButton orgSlug={org} />
      </div>
      <LabelTemplateEditor orgSlug={org} templateId={null} />
    </div>
  );
}
