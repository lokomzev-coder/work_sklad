import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const passwordHash = await bcrypt.hash("QaPassword123!", 12);
  const slug = `qa-smoke-${Date.now()}`;
  const user = await prisma.user.create({ data: { name: "QA Smoke", email: `qa-smoke-${Date.now()}@example.com`, passwordHash } });
  const org = await prisma.organization.create({
    data: { name: "QA Smoke Org", slug, trialEndsAt: new Date(Date.now() + 14 * 86_400_000) },
  });
  await prisma.membership.create({ data: { userId: user.id, orgId: org.id, role: "ADMIN", login: "qasmoke" } });
  console.log(JSON.stringify({ slug, loginId: `qasmoke@${slug}` }));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
