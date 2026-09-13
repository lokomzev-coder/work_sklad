import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPlatformAdminContext, assertPlatformPermission, getAdminBasePath } from "@/lib/platform-auth";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const ACTION_LABEL: Record<string, string> = {
  LOGIN: "Вход",
  LOGIN_FAILED: "Неудачный вход (пароль)",
  LOGIN_FAILED_TOTP: "Неудачный вход (код 2FA)",
  LOGIN_RATE_LIMITED: "Вход заблокирован (много попыток)",
  ADMIN_INVITED: "Приглашён администратор",
  ADMIN_ROLE_CHANGED: "Изменена роль администратора",
  ADMIN_DEACTIVATED: "Администратор отключён",
  ADMIN_REACTIVATED: "Администратор включён",
  ADMIN_SETUP_COMPLETED: "Администратор завершил настройку",
  PLATFORM_ROLE_CREATED: "Создана роль",
  PLATFORM_ROLE_UPDATED: "Изменена роль",
  PLATFORM_ROLE_DELETED: "Удалена роль",
  PLAN_CREATED: "Создан тариф",
  PLAN_UPDATED: "Изменён тариф",
  PLAN_DELETED: "Удалён тариф",
  SUBSCRIPTION_GRANTED: "Выдана подписка",
  SUBSCRIPTION_CHANGED: "Изменена подписка",
  SUBSCRIPTION_REVOKED: "Отозвана подписка",
  SUBSCRIPTION_SELF_SERVICE_PURCHASE: "Организация оформила тариф сама",
  SUBSCRIPTION_AUTO_RENEWED: "Автопродление подписки",
  BALANCE_TOPUP: "Пополнение баланса организации",
  FEATURE_ITEM_CREATED: "Создан пункт конструктора",
  FEATURE_ITEM_UPDATED: "Изменён пункт конструктора",
  FEATURE_ITEM_ARCHIVED: "Пункт конструктора архивирован",
  FEATURE_ITEM_REACTIVATED: "Пункт конструктора восстановлен",
};

/** Дороже других страниц панели по чувствительности данных — журнал
 * содержит IP-адреса и историю неудачных попыток входа, поэтому отдельная
 * capability (`viewAuditLog`), не объединена с `manageAdmins`. */
export default async function PlatformAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ orgId?: string }>;
}) {
  const ctx = await getPlatformAdminContext();
  const base = getAdminBasePath();
  assertPlatformPermission(ctx, "viewAuditLog");
  const { orgId } = await searchParams;

  const logs = await prisma.platformAuditLog.findMany({
    where: orgId ? { targetOrgId: orgId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { platformAdmin: true },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Журнал аудита панели</h1>
      {orgId && (
        <p className="text-sm text-muted-foreground">
          Фильтр по организации активен —{" "}
          <Link href={`${base}/audit-log`} className="underline">
            показать всё
          </Link>
        </p>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Действие</TableHead>
              <TableHead>Кто</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Когда</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Записей пока нет
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {ACTION_LABEL[log.action] ?? log.action}
                    {log.action.startsWith("LOGIN_FAILED") || log.action === "LOGIN_RATE_LIMITED" ? (
                      <Badge variant="destructive" className="ml-2">
                        !
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{log.platformAdmin?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{log.ip ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{log.createdAt.toLocaleString("ru-RU")}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
