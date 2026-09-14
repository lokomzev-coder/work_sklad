import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Security fix (external review, 2026-09-13) — outbound webhook delivery
 * (lib/webhooks.ts) `fetch()`ed an organization ADMIN-supplied URL with no
 * check at all against internal/private targets. In this multi-tenant
 * SaaS, an org's ADMIN is a customer, not a trusted operator of the
 * platform — a malicious or compromised org account could point a webhook
 * at `http://169.254.169.254/` (cloud instance metadata), `http://
 * localhost:5432/`, or any other address only reachable from the server
 * itself, using this app as an SSRF proxy.
 *
 * Checked at two points, deliberately: webhook creation (actions/
 * webhooks.ts — immediate feedback instead of a silently-failing delivery
 * queue) AND every actual delivery attempt (lib/webhooks.ts — a hostname's
 * DNS record can change after the webhook was saved).
 *
 * Known, disclosed limitation: this resolves DNS once, validates the
 * result, and only THEN calls fetch() — a classic TOCTOU/"DNS rebinding"
 * attacker could have their DNS server return a public IP for this check
 * and a private one moments later when fetch() does its own independent
 * resolution. Closing that fully needs pinning the validated IP for the
 * actual TCP connection (a custom undici dispatcher), which is real extra
 * complexity not undertaken in this pass — this is the practical majority
 * fix (static private URLs, which is what every realistic report of this
 * class of bug against this app would look like), not a claim of
 * complete protection against a patient, DNS-controlling attacker.
 */
export class UnsafeWebhookUrlError extends Error {}

function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local, incl. cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 carrier-grade NAT
  if (a === 192 && b === 0 && parts[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isPrivateOrReservedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (/^f[cd][0-9a-f]{0,2}:/.test(lower)) return true; // fc00::/7 unique local
  if (lower.startsWith("::ffff:")) {
    const embedded = lower.slice("::ffff:".length);
    if (isIP(embedded) === 4) return isPrivateOrReservedIPv4(embedded);
  }
  return false;
}

/** Throws UnsafeWebhookUrlError if the URL isn't http(s), or resolves to a
 * private/loopback/link-local/reserved address. Call before saving a
 * webhook URL and before every delivery attempt. */
export async function assertPublicWebhookUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new UnsafeWebhookUrlError("Некорректный URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeWebhookUrlError("URL вебхука должен использовать http или https");
  }

  const hostname = parsed.hostname;
  if (hostname.toLowerCase() === "localhost") {
    throw new UnsafeWebhookUrlError("URL вебхука указывает на внутренний адрес");
  }

  const literalVersion = isIP(hostname);
  if (literalVersion === 4 && isPrivateOrReservedIPv4(hostname)) {
    throw new UnsafeWebhookUrlError("URL вебхука указывает на внутренний/зарезервированный адрес");
  }
  if (literalVersion === 6 && isPrivateOrReservedIPv6(hostname)) {
    throw new UnsafeWebhookUrlError("URL вебхука указывает на внутренний/зарезервированный адрес");
  }
  if (literalVersion) return;

  let addresses: { address: string; family: number }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new UnsafeWebhookUrlError("Не удалось разрешить хост вебхука");
  }
  for (const { address, family } of addresses) {
    if (family === 4 && isPrivateOrReservedIPv4(address)) {
      throw new UnsafeWebhookUrlError("URL вебхука разрешается во внутренний/зарезервированный адрес");
    }
    if (family === 6 && isPrivateOrReservedIPv6(address)) {
      throw new UnsafeWebhookUrlError("URL вебхука разрешается во внутренний/зарезервированный адрес");
    }
  }
}
