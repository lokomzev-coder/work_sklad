import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.memberships.length === 1) {
    redirect(`/${session.memberships[0].orgSlug}`);
  }

  redirect("/org-select");
}
