import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OrgSelectPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const memberships = session.memberships ?? [];

  if (memberships.length === 0) {
    return (
      <div className="mx-auto flex max-w-sm flex-col items-center gap-4 p-10 text-center">
        <h1 className="text-xl font-semibold">Нет организаций</h1>
        <p className="text-muted-foreground">
          Вы пока не состоите ни в одной организации. Обратитесь к
          администратору или зарегистрируйте новую.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-10">
      <h1 className="text-xl font-semibold">Выберите организацию</h1>
      {memberships.map((m) => (
        <Link key={m.orgId} href={m.role === "PRODUCTION" ? `/${m.orgSlug}/floor` : `/${m.orgSlug}`}>
          <Card className="transition-colors hover:bg-accent">
            <CardHeader>
              <CardTitle>{m.orgName}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Роль: {m.role}
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
