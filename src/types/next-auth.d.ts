import type { Role } from "@/generated/prisma/enums";

export interface OrgMembership {
  orgId: string;
  orgSlug: string;
  orgName: string;
  role: Role;
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
    };
    // Optional — Блок L's admin-panel session (lib/admin-auth.ts) shares
    // this same global module augmentation (both instances import types
    // from the same "next-auth" package) but has no org memberships at
    // all; only the org-side session (lib/auth.ts) ever sets this.
    memberships?: OrgMembership[];
  }

  interface User {
    id: string;
    email: string;
    name: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    memberships: OrgMembership[];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid: string;
    memberships: OrgMembership[];
  }
}
