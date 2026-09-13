import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "apiKeys", "view")) notFound();

  const apiKeys = await prisma.apiKey.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="api-keys" />
      <div>
        <h1 className="text-2xl font-semibold">API-ключи</h1>
        <p className="text-sm text-muted-foreground">
          Ключ даёт полный доступ к данным организации через публичный REST API
          (<code>/api/v1/entity/...</code>, заголовок <code>Authorization: Bearer &lt;ключ&gt;</code>).
          Показывается только один раз при создании — сохраните его сразу.
        </p>
      </div>
      <ApiKeysManager
        orgSlug={org}
        apiKeys={apiKeys.map((k) => ({
          id: k.id,
          name: k.name,
          keyPrefix: k.keyPrefix,
          lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toLocaleString("ru-RU") : null,
          revokedAt: k.revokedAt ? k.revokedAt.toLocaleString("ru-RU") : null,
          createdAt: k.createdAt.toLocaleString("ru-RU"),
        }))}
      />
    </div>
  );
}
