import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { OrgMembership } from "@/types/next-auth";
import { checkLoginRateLimit } from "@/lib/login-rate-limit";
import { getClientIp } from "@/lib/request-ip";

/** Security fix (external review, 2026-09-13) — a distinct error code so
 * loginAction (actions/auth.ts) can show a "slow down" message instead of
 * the generic "wrong login or password", same split as
 * lib/admin-auth.ts's InvalidAdminCredentials/AdminRateLimited. */
class RateLimitedCredentials extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        loginId: { label: "Логин", type: "text" },
        password: { label: "Пароль", type: "password" },
      },
      // loginId is "login@orgSlug", МойСклад-style — the org half scopes
      // which Membership.login to look up, it is NOT a real email domain.
      // Password still lives on User (see schema comment on Membership.login
      // for why), so a match resolves to that Membership's user.
      authorize: async (credentials, request) => {
        const loginId = credentials?.loginId;
        const password = credentials?.password;
        if (typeof loginId !== "string" || typeof password !== "string") {
          return null;
        }

        // Security fix (external review, 2026-09-13): this had no rate
        // limiting at all — see lib/login-rate-limit.ts's own comment for
        // why it's tuned looser than the admin panel's, not why it exists.
        const ip = getClientIp(request);
        const rateLimit = checkLoginRateLimit(loginId, ip);
        if (!rateLimit.allowed) {
          throw new RateLimitedCredentials();
        }

        const atIndex = loginId.lastIndexOf("@");
        if (atIndex <= 0 || atIndex === loginId.length - 1) return null;
        const login = loginId.slice(0, atIndex).toLowerCase();
        const orgSlug = loginId.slice(atIndex + 1).toLowerCase();

        const membership = await prisma.membership.findFirst({
          where: { login, org: { slug: orgSlug } },
          include: { user: true },
        });

        // Security fix (external review, 2026-09-13): always run
        // bcrypt.compare, even against a dummy hash when no membership
        // matches — a real vs. missing login@orgSlug must take
        // indistinguishable time, or response latency itself becomes a
        // timing side-channel for enumerating valid logins (this used to
        // `return null` immediately here, before ever calling bcrypt).
        const passwordMatches = await bcrypt.compare(
          password,
          membership?.user.passwordHash ?? "$2b$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv",
        );
        if (!membership || !passwordMatches) return null;

        return {
          id: membership.user.id,
          email: membership.user.email,
          name: membership.user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user?.id) {
        token.uid = user.id;
      }

      if (user || trigger === "update") {
        const memberships = await prisma.membership.findMany({
          where: { userId: token.uid },
          include: { org: true },
        });
        token.memberships = memberships.map(
          (m): OrgMembership => ({
            orgId: m.orgId,
            orgSlug: m.org.slug,
            orgName: m.org.name,
            role: m.role,
          }),
        );
      }

      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid;
      session.memberships = token.memberships ?? [];
      return session;
    },
  },
});
