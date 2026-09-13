import { AdminSetupForm } from "@/components/admin/admin-setup-form";
import { getAdminBasePath } from "@/lib/platform-auth";

/** Public page (no admin session — see src/proxy.ts's /admin/setup/
 * exemption) reached only via the one-time invite link
 * (`invitePlatformAdmin`, actions/platform-admins.ts) — the token in the
 * URL IS the credential for this one page, checked server-side inside
 * `startPlatformAdminSetup`/`confirmPlatformAdminSetup`, not here. */
export default async function AdminSetupPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-sm">
      <AdminSetupForm token={token} adminBasePath={getAdminBasePath()} />
    </div>
  );
}
