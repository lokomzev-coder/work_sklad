/**
 * Block S — the admin panel's PUBLIC base path (see src/proxy.ts for the
 * matching rewrite/perimeter logic). Deliberately its own file with zero
 * other imports: lib/admin-auth.ts needs this at NextAuth config
 * (module-load) time, and lib/platform-auth.ts already imports FROM
 * lib/admin-auth.ts — putting this function in either of those two files
 * would make them import each other.
 *
 * Server-only on purpose: this must never reach a client bundle (would
 * defeat its own point), so every place that needs to BUILD a link into
 * the panel reads it here, on the server, and threads the resolved string
 * down as a prop where a client component needs to render it.
 */
export function getAdminBasePath(): string {
  return process.env.ADMIN_PATH || "/admin";
}
