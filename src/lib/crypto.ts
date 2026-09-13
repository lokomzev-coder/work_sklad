import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getMasterKey(): Buffer {
  const encoded = process.env.ENCRYPTION_MASTER_KEY;
  if (!encoded) {
    throw new Error("ENCRYPTION_MASTER_KEY is not set");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(
      "ENCRYPTION_MASTER_KEY must decode to exactly 32 bytes (base64-encoded)",
    );
  }
  return key;
}

/**
 * Materializes a plain, freshly-allocated Uint8Array<ArrayBuffer> — what
 * Prisma's generated types require for Bytes fields. Buffer's generic is
 * Uint8Array<ArrayBufferLike> (it can't rule out SharedArrayBuffer), so a
 * Buffer value is never directly assignable to a Prisma Bytes field even
 * though it behaves identically at runtime; this copy is the boundary fix.
 * The explicit <ArrayBuffer> return annotation matters here — without it
 * TS widens back to the default Uint8Array<ArrayBufferLike>.
 */
function toBytes(buf: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(buf);
}

interface RawEncrypted {
  ciphertext: Buffer;
  nonce: Buffer;
  authTag: Buffer;
}

interface RawEncryptedInput {
  ciphertext: Uint8Array;
  nonce: Uint8Array;
  authTag: Uint8Array;
}

function encryptWithKey(key: Uint8Array, plaintext: Uint8Array): RawEncrypted {
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return { ciphertext, nonce, authTag };
}

function decryptWithKey(key: Uint8Array, payload: RawEncryptedInput): Buffer {
  const decipher = crypto.createDecipheriv(ALGORITHM, key, payload.nonce);
  decipher.setAuthTag(payload.authTag);
  // Throws (tampered/corrupted ciphertext or wrong key) if the auth tag
  // doesn't verify -- callers must not swallow this error.
  return Buffer.concat([
    decipher.update(payload.ciphertext),
    decipher.final(),
  ]);
}

/** Generates a fresh 32-byte data-encryption-key for one organization. */
export function generateDek(): Buffer {
  return crypto.randomBytes(32);
}

/**
 * Wraps (encrypts) an organization's DEK with the app-wide master key.
 * The auth tag is appended to the wrapped blob so Organization only needs
 * two columns (encDekWrapped, encDekNonce) to store it.
 */
export function wrapDek(
  dek: Uint8Array,
): { wrapped: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer> } {
  const { ciphertext, nonce, authTag } = encryptWithKey(getMasterKey(), dek);
  return {
    wrapped: toBytes(Buffer.concat([ciphertext, authTag])),
    nonce: toBytes(nonce),
  };
}

export function unwrapDek(wrapped: Uint8Array, nonce: Uint8Array): Buffer {
  const authTag = wrapped.subarray(wrapped.length - AUTH_TAG_LENGTH);
  const ciphertext = wrapped.subarray(0, wrapped.length - AUTH_TAG_LENGTH);
  return decryptWithKey(getMasterKey(), { ciphertext, nonce, authTag });
}

export interface EncryptedSecret {
  ciphertext: Uint8Array<ArrayBuffer>;
  nonce: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
}

/** Encrypts one vault secret with the organization's (already-unwrapped) DEK. */
export function encryptSecret(dek: Uint8Array, plaintext: string): EncryptedSecret {
  const { ciphertext, nonce, authTag } = encryptWithKey(
    dek,
    Buffer.from(plaintext, "utf8"),
  );
  return {
    ciphertext: toBytes(ciphertext),
    nonce: toBytes(nonce),
    authTag: toBytes(authTag),
  };
}

export function decryptSecret(
  dek: Uint8Array,
  secret: RawEncryptedInput,
): string {
  return decryptWithKey(dek, secret).toString("utf8");
}

/**
 * Блок L — encrypts a platform-level secret (currently: PlatformAdmin's
 * TOTP secret) directly with the app-wide master key, same idiom as
 * `wrapDek` (auth tag appended to the ciphertext blob, nonce kept
 * separate — two columns). Deliberately NOT routed through an
 * organization's DEK: a platform secret doesn't belong to any single
 * organization, so there's no DEK to route it through in the first place.
 */
export function encryptWithMasterKey(
  plaintext: string,
): { wrapped: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer> } {
  const { ciphertext, nonce, authTag } = encryptWithKey(
    getMasterKey(),
    Buffer.from(plaintext, "utf8"),
  );
  return {
    wrapped: toBytes(Buffer.concat([ciphertext, authTag])),
    nonce: toBytes(nonce),
  };
}

export function decryptWithMasterKey(wrapped: Uint8Array, nonce: Uint8Array): string {
  const authTag = wrapped.subarray(wrapped.length - AUTH_TAG_LENGTH);
  const ciphertext = wrapped.subarray(0, wrapped.length - AUTH_TAG_LENGTH);
  return decryptWithKey(getMasterKey(), { ciphertext, nonce, authTag }).toString("utf8");
}
