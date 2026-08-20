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
    memberships: OrgMembership[];
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
