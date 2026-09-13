import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { MAX_ATTEMPTS } from "@/lib/webhooks";
import { SettingsSubnav } from "@/components/settings/settings-subnav";
import { WebhooksManager } from "@/components/settings/webhooks-manager";

export default async function WebhooksPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "webhooks", "view")) notFound();

  const webhooks = await prisma.webhook.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    include: { deliveries: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  return (
    <div className="flex flex-col gap-6">
      <SettingsSubnav org={org} active="webhooks" />
      <div>
        <h1 className="text-2xl font-semibold">Вебхуки</h1>
        <p className="text-sm text-muted-foreground">
          Получайте уведомления о событиях в системе на свой URL. Тело запроса подписано
          HMAC-SHA256 (заголовок X-WorkSklad-Signature) секретом вебхука. Неудачная доставка
          повторяется автоматически (до {MAX_ATTEMPTS} попыток с нарастающей паузой) — статус
          повтора виден в истории ниже.
        </p>
      </div>
      <WebhooksManager
        orgSlug={org}
        maxAttempts={MAX_ATTEMPTS}
        webhooks={webhooks.map((w) => ({
          id: w.id,
          url: w.url,
          secret: w.secret,
          events: w.events,
          isActive: w.isActive,
          deliveries: w.deliveries.map((d) => ({
            id: d.id,
            success: d.success,
            createdAt: d.createdAt.toLocaleString("ru-RU"),
            statusCode: d.statusCode,
            error: d.error,
            attemptCount: d.attemptCount,
            nextRetryAt: d.nextRetryAt ? d.nextRetryAt.toLocaleString("ru-RU") : null,
          })),
        }))}
      />
    </div>
  );
}
