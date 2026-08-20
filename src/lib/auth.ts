import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { OrgMembership } from "@/types/next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const passwordMatches = await bcrypt.compare(
          password,
          user.passwordHash,
        );
        if (!passwordMatches) return null;

        return { id: user.id, email: user.email, name: user.name };
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
