import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
import { prisma } from "@/lib/prisma";
import { decryptWithMasterKey } from "@/lib/crypto";
import { checkAdminLoginRateLimit } from "@/lib/admin-rate-limit";
import { getAdminBasePath } from "@/lib/admin-path";

/**
 * Блок L — completely separate NextAuth instance for the developer/
 * platform panel (`/admin`), deliberately not sharing anything with
 * `lib/auth.ts` (the org-side login):
 *
 * - Different table (`PlatformAdmin`, not `User`/`Membership`) — a
 *   platform admin has no organization, and org login (`login@orgSlug`)
 *   has no meaning here.
 * - Different session cookie name (`admin-session-token` below, vs.
 *   next-auth's default `authjs.session-token`) — this is the actual
 *   isolation guarantee: an attacker (or just a confused browser tab) who
 *   has a valid org session, even as that org's ADMIN, holds a cookie
 *   this instance never reads. The two logins simply don't share state.
 * - Mandatory TOTP as a THIRD credential alongside email+password, checked
 *   in the same authorize() call (not a separate step) — fewer round
 *   trips for an attacker to probe against, and no intermediate
 *   "password accepted" state to leak via timing/response differences.
 *
 * See middleware.ts (root) for the cheap perimeter check on `/admin/*`,
 * and lib/platform-auth.ts for the actual per-request context/capability
 * check every admin page and server action performs independently — the
 * session cookie alone is necessary but not sufficient.
 */

class InvalidAdminCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}

class AdminRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

function getClientIp(request: Request | undefined): string {
  const forwardedFor = request?.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

export const {
  handlers: adminHandlers,
  auth: adminAuth,
  signIn: adminSignIn,
  signOut: adminSignOut,
} = NextAuth({
  // Mounted at a non-default path (src/app/api/admin-auth/[...nextauth]/
  // route.ts, not the framework default /api/auth) — basePath must be told
  // explicitly or Auth.js core can't parse /api/admin-auth/callback/... as
  // a valid action+provider pair ("UnknownAction" otherwise).
  basePath: "/api/admin-auth",
  session: { strategy: "jwt" },
  pages: { signIn: `${getAdminBasePath()}/login` },
  cookies: {
    sessionToken: {
      name: "admin-session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Пароль", type: "password" },
        totpCode: { label: "Код 2FA", type: "text" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email;
        const password = credentials?.password;
        const totpCode = credentials?.totpCode;
        if (typeof email !== "string" || typeof password !== "string" || typeof totpCode !== "string") {
          throw new InvalidAdminCredentials();
        }

        const ip = getClientIp(request);
        const rateLimit = checkAdminLoginRateLimit(email, ip);
        if (!rateLimit.allowed) {
          await prisma.platformAuditLog.create({
            data: { action: "LOGIN_RATE_LIMITED", ip },
          });
          throw new AdminRateLimited();
        }

        const admin = await prisma.platformAdmin.findFirst({
          where: { email: email.toLowerCase(), status: "ACTIVE" },
        });
        // Deliberately runs bcrypt.compare against a dummy hash even when no
        // admin row matches — a real vs. missing account must take
        // indistinguishable time, or the response latency itself leaks
        // which emails are valid platform admins (there are very few of
        // them, so this is a meaningfully guessable set).
        const passwordMatches = await bcrypt.compare(
          password,
          admin?.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv",
        );
        if (!admin || !passwordMatches || !admin.totpSecretEnc || !admin.totpSecretNonce) {
          await prisma.platformAuditLog.create({
            data: { platformAdminId: admin?.id, action: "LOGIN_FAILED", ip },
          });
          throw new InvalidAdminCredentials();
        }

        const secretBase32 = decryptWithMasterKey(admin.totpSecretEnc, admin.totpSecretNonce);
        const totp = new TOTP({ secret: Secret.fromBase32(secretBase32) });
        // window: 1 tolerates one 30s step of clock drift each direction —
        // wide enough for real-world clock skew, not wide enough to make
        // brute-forcing the 6-digit code meaningfully easier.
        const delta = totp.validate({ token: totpCode, window: 1 });
        if (delta === null) {
          await prisma.platformAuditLog.create({
            data: { platformAdminId: admin.id, action: "LOGIN_FAILED_TOTP", ip },
          });
          throw new InvalidAdminCredentials();
        }

        await prisma.$transaction([
          prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } }),
          prisma.platformAuditLog.create({
            data: { platformAdminId: admin.id, action: "LOGIN", ip },
          }),
        ]);

        return { id: admin.id, email: admin.email, name: admin.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string;
      return session;
    },
  },
});
