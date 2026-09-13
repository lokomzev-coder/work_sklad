import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }
  const memberships = session.memberships ?? [];

  if (memberships.length === 1) {
    redirect(`/${memberships[0].orgSlug}`);
  }

  redirect("/org-select");
}
