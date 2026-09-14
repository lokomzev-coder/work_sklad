import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { canAccessVaultEntry } from "@/lib/vault-scope";
import { updateVaultEntry } from "@/actions/vault";
import { VaultEntryForm } from "@/components/vault/vault-entry-form";
import { VaultAccessManager } from "@/components/vault/vault-access-manager";
import { RevealSecretButton } from "@/components/vault/reveal-secret-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export default async function VaultEntryPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  const { org, id } = await params;
  const ctx = await getOrgContext(org);

  if (!can(ctx, "vault", "view")) {
    notFound();
  }
  // Security fix (external review, 2026-09-13): the coarse `can()` check
  // above only confirms the role can view "the vault resource" in general
  // — a grant-scoped (OWN) role must still have been explicitly granted
  // THIS entry (see lib/vault-scope.ts).
  if (!(await canAccessVaultEntry(ctx, id, "view"))) {
    notFound();
  }
  const canEdit = can(ctx, "vault", "edit") && (await canAccessVaultEntry(ctx, id, "edit"));

  const entry = await prisma.vaultServiceEntry.findFirst({
    where: { id, orgId: ctx.orgId },
    include: {
      tags: { include: { tag: true } },
      accessGrants: { include: { employee: true }, orderBy: { grantedAt: "desc" } },
      accessLogs: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!entry) {
    notFound();
  }

  const grantedEmployeeIds = new Set(entry.accessGrants.map((g) => g.employeeId));
  const activeEmployees = await prisma.employee.findMany({
    where: { orgId: ctx.orgId, status: "ACTIVE" },
    orderBy: { fullName: "asc" },
  });
  const availableEmployees = activeEmployees
    .filter((e) => !grantedEmployeeIds.has(e.id))
    .map((e) => ({ value: e.id, label: e.fullName }));

  const boundAction = updateVaultEntry.bind(null, org, entry.id);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{entry.serviceName}</h1>

      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {entry.tags.map(({ tag }) => (
            <Badge key={tag.id} variant="secondary">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Пароль</CardTitle>
          </CardHeader>
          <CardContent>
            <RevealSecretButton orgSlug={org} entryId={entry.id} />
          </CardContent>
        </Card>
      )}

      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Доступ сотрудников</CardTitle>
          </CardHeader>
          <CardContent>
            <VaultAccessManager
              orgSlug={org}
              entryId={entry.id}
              grantedEmployees={entry.accessGrants.map((g) => ({
                id: g.employee.id,
                fullName: g.employee.fullName,
              }))}
              availableEmployees={availableEmployees}
            />
          </CardContent>
        </Card>
      )}

      {canEdit ? (
        <VaultEntryForm
          orgSlug={org}
          action={boundAction}
          defaultValues={{
            serviceName: entry.serviceName,
            url: entry.url,
            username: entry.username,
            notes: entry.notes,
          }}
          submitLabel="Сохранить"
          isEdit
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div>
              <Label className="text-muted-foreground">Адрес</Label>
              <p>{entry.url ?? "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Логин</Label>
              <p>{entry.username ?? "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Заметки</Label>
              <p>{entry.notes ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {canEdit && entry.accessLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Недавние просмотры пароля</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            {entry.accessLogs.map((log) => (
              <div key={log.id}>
                {log.user.name} — {log.createdAt.toLocaleString("ru-RU")}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
