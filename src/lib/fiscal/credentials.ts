import { prisma } from "@/lib/prisma";
import { getOrgDek } from "@/lib/org-dek";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

export interface FiscalConfig {
  provider: string;
  groupCode: string;
  inn: string;
  paymentAddress: string;
  sno: string;
  login: string;
  password: string;
}

interface StoredSecret {
  login: string;
  password: string;
}

/**
 * Block E: reads an org's ОФД (fiscal receipt) settings. Returns null if
 * fiscalization isn't configured for this org — the caller must treat that
 * as "opt-in, not yet enabled," never as an error, since a retail sale must
 * never be blocked by missing fiscal credentials.
 *
 * login/password are encrypted with this org's DEK the same way Vault
 * entries are (`lib/crypto.ts`'s `encryptSecret`/`decryptSecret`), but
 * stored directly on `Organization` rather than as a `VaultServiceEntry` —
 * that model is built for human-viewed, access-granted secrets
 * (`EmployeeVaultAccess`, audit-logged views); these credentials are read
 * programmatically by a background job (the fiscal-status cron, checkout),
 * which doesn't fit that shape.
 */
export async function getFiscalConfig(orgId: string): Promise<FiscalConfig | null> {
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: {
      fiscalProvider: true,
      fiscalGroupCode: true,
      fiscalInn: true,
      fiscalPaymentAddress: true,
      fiscalSno: true,
      fiscalCredentialsCiphertext: true,
      fiscalCredentialsNonce: true,
      fiscalCredentialsAuthTag: true,
    },
  });

  if (
    !org.fiscalProvider ||
    !org.fiscalGroupCode ||
    !org.fiscalInn ||
    !org.fiscalPaymentAddress ||
    !org.fiscalSno ||
    !org.fiscalCredentialsCiphertext ||
    !org.fiscalCredentialsNonce ||
    !org.fiscalCredentialsAuthTag
  ) {
    return null;
  }

  const dek = await getOrgDek(orgId);
  const json = decryptSecret(dek, {
    ciphertext: org.fiscalCredentialsCiphertext,
    nonce: org.fiscalCredentialsNonce,
    authTag: org.fiscalCredentialsAuthTag,
  });
  const secret = JSON.parse(json) as StoredSecret;

  return {
    provider: org.fiscalProvider,
    groupCode: org.fiscalGroupCode,
    inn: org.fiscalInn,
    paymentAddress: org.fiscalPaymentAddress,
    sno: org.fiscalSno,
    login: secret.login,
    password: secret.password,
  };
}

/** Sets (or replaces) an org's ОФД settings — called from the settings UI
 * (not built in v1, per ROADMAP scope cuts; credentials are seeded directly
 * for now, see docs/handbook/retail-integrations/atol-fiscalization.md). */
export async function setFiscalConfig(
  orgId: string,
  config: {
    provider: string;
    groupCode: string;
    inn: string;
    paymentAddress: string;
    sno: string;
    login: string;
    password: string;
  },
): Promise<void> {
  const dek = await getOrgDek(orgId);
  const encrypted = encryptSecret(dek, JSON.stringify({ login: config.login, password: config.password }));

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      fiscalProvider: config.provider,
      fiscalGroupCode: config.groupCode,
      fiscalInn: config.inn,
      fiscalPaymentAddress: config.paymentAddress,
      fiscalSno: config.sno,
      fiscalCredentialsCiphertext: encrypted.ciphertext,
      fiscalCredentialsNonce: encrypted.nonce,
      fiscalCredentialsAuthTag: encrypted.authTag,
    },
  });
}
