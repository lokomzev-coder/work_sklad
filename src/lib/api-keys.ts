import { randomBytes, createHash } from "node:crypto";

const KEY_PREFIX = "ewk_";

/** Generates a fresh plaintext API key. Shown to the caller exactly once —
 * only its hash (see hashApiKey) is ever persisted, same "generate once,
 * show once" pattern as a GitHub PAT. */
export function generateApiKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** Deterministic, one-way — used both to store a new key (hash the
 * plaintext once) and to verify an incoming request (hash the presented
 * Bearer token, look it up by hash). Plain sha256 is fine here: unlike a
 * password, an API key is already a high-entropy random value with no
 * dictionary to attack, so a slow KDF (bcrypt/scrypt) buys nothing and
 * would needlessly slow down every API request. */
export function hashApiKey(plaintextKey: string): string {
  return createHash("sha256").update(plaintextKey).digest("hex");
}

/** First few characters of the plaintext, safe to store/display forever —
 * lets the settings UI show "ewk_a1b2c3d4..." to help identify a key
 * without being able to reconstruct the real value from it. */
export function keyPrefixFor(plaintextKey: string): string {
  return plaintextKey.slice(0, KEY_PREFIX.length + 8);
}
