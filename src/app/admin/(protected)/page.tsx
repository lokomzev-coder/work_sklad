import { getPlatformAdminContext } from "@/lib/platform-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Landing page of the panel — full section pages (organizations,
 * subscriptions, platform-admin/role management, audit log) come in later
 * phases of Block L; this confirms the auth/context foundation end-to-end
 * for now (getPlatformAdminContext redirects to /admin/login on any
 * invalid/missing session). */
export default async function AdminHomePage() {
  const ctx = await getPlatformAdminContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Панель разработчика</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Текущий администратор</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Имя: </span>
            {ctx.name}
          </div>
          <div>
            <span className="text-muted-foreground">Email: </span>
            {ctx.email}
          </div>
          <div>
            <span className="text-muted-foreground">Роль: </span>
            {ctx.isOwner ? (
              <Badge variant="destructive">Головной аккаунт (полный доступ)</Badge>
            ) : (
              <Badge variant="secondary">Платформенный администратор</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
