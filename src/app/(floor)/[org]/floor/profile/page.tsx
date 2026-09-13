import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateOwnProfile, changeOwnPassword, updateOwnDefaults } from "@/actions/profile";
import { ProfileForm, ChangePasswordForm, DefaultsForm } from "@/components/settings/profile-form";

/** Block I2.3 — same self-service profile as `/settings/profile`, just
 * reachable from the floor interface (PRODUCTION role never sees `/settings`
 * at all, see (dashboard)/[org]/layout.tsx's redirect gate). */
export default async function FloorProfilePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);

  const [user, stores, legalEntities, employeeDefaults] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { name: true, email: true },
    }),
    prisma.store.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.legalEntity.findMany({ where: { orgId: ctx.orgId, status: "ACTIVE" }, orderBy: { name: "asc" } }),
    ctx.employeeId
      ? prisma.employee.findFirst({
          where: { id: ctx.employeeId },
          select: { defaultStoreId: true, defaultLegalEntityId: true, openPdfInBrowser: true },
        })
      : null,
  ]);

  const updateProfileAction = updateOwnProfile.bind(null, org);
  const changePasswordAction = changeOwnPassword.bind(null, org);
  const updateDefaultsAction = updateOwnDefaults.bind(null, org);

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <h1 className="text-2xl font-semibold">Профиль</h1>
      <ProfileForm action={updateProfileAction} defaultValues={user} />
      {ctx.employeeId && (
        <DefaultsForm
          action={updateDefaultsAction}
          storeOptions={stores.map((s) => ({ value: s.id, label: s.name }))}
          legalEntityOptions={legalEntities.map((e) => ({ value: e.id, label: e.name }))}
          defaultValues={{
            defaultStoreId: employeeDefaults?.defaultStoreId ?? null,
            defaultLegalEntityId: employeeDefaults?.defaultLegalEntityId ?? null,
            openPdfInBrowser: employeeDefaults?.openPdfInBrowser ?? false,
          }}
        />
      )}
      <ChangePasswordForm action={changePasswordAction} />
    </div>
  );
}
