import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/tenant";
import { updateOwnProfile, changeOwnPassword, updateOwnDefaults } from "@/actions/profile";
import { ProfileForm, ChangePasswordForm, DefaultsForm } from "@/components/settings/profile-form";

/**
 * Block I2.3 — deliberately NOT gated by `assertPermission(ctx.role,
 * "settings", ...)` like the rest of `/settings/**`: this is about the
 * logged-in person themselves, not organization settings, so every role
 * (including EMPLOYEE, which has no other settings access) can reach it —
 * via the "Профиль" link in the dashboard header, not the settings subnav.
 */
export default async function ProfilePage({
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
          select: { defaultStoreId: true, defaultLegalEntityId: true },
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
          }}
        />
      )}
      <ChangePasswordForm action={changePasswordAction} />
    </div>
  );
}
