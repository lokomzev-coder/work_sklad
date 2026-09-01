import { notFound } from "next/navigation";
import { getOrgContext } from "@/lib/tenant";
import { can } from "@/lib/permissions";
import { NewRoleForm } from "@/components/settings/new-role-form";

export default async function NewRolePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const ctx = await getOrgContext(org);
  if (!can(ctx, "customRoles", "create")) notFound();

  return (
    <div className="flex max-w-sm flex-col gap-4">
      <h1 className="text-2xl font-semibold">Новая роль</h1>
      <NewRoleForm orgSlug={org} />
    </div>
  );
}
