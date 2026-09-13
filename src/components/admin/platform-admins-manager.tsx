"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { invitePlatformAdmin, updatePlatformAdminRole, setPlatformAdminStatus } from "@/actions/platform-admins";

export interface PlatformAdminRow {
  id: string;
  email: string;
  name: string;
  isOwner: boolean;
  status: string;
  platformRoleId: string | null;
  hasCompletedSetup: boolean;
  lastLoginAt: string | null;
}

export interface PlatformRoleOption {
  id: string;
  name: string;
}

interface PlatformAdminsManagerProps {
  admins: PlatformAdminRow[];
  roles: PlatformRoleOption[];
  currentAdminId: string;
}

export function PlatformAdminsManager({ admins, roles, currentAdminId }: PlatformAdminsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState<string>("__none__");
  const [setupUrl, setSetupUrl] = useState<string | null>(null);

  function handleInvite() {
    if (!email.trim() || !name.trim()) return;
    startTransition(async () => {
      const result = await invitePlatformAdmin(email.trim(), name.trim(), roleId === "__none__" ? null : roleId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setEmail("");
      setName("");
      setRoleId("__none__");
      if (result.setupPath) {
        setSetupUrl(`${window.location.origin}${result.setupPath}`);
      }
      router.refresh();
    });
  }

  function handleCopy() {
    if (!setupUrl) return;
    navigator.clipboard.writeText(setupUrl).then(() => toast.success("Скопировано"));
  }

  function handleRoleChange(adminId: string, newRoleId: string) {
    startTransition(async () => {
      const result = await updatePlatformAdminRole(adminId, newRoleId === "__none__" ? null : newRoleId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleStatusToggle(adminId: string, currentStatus: string) {
    const nextStatus = currentStatus === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
    startTransition(async () => {
      const result = await setPlatformAdminStatus(adminId, nextStatus);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {setupUrl && (
        <div className="flex flex-col gap-2 rounded-md border border-primary bg-primary/5 p-4">
          <p className="text-sm font-medium">
            Приглашение создано — передайте эту ссылку новому администратору лично/по защищённому каналу
            (второй раз она не покажется). Он сам задаст пароль и настроит 2FA — вы их не увидите.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-2 py-1.5 text-sm break-all">{setupUrl}</code>
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="size-4" />
            </Button>
          </div>
          <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setSetupUrl(null)}>
            Скрыть
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-md border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label>Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Имя</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:max-w-xs">
          <Label>Роль</Label>
          <Select value={roleId} onValueChange={(v) => setRoleId(v ?? "__none__")}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Без роли (пока без доступа)</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          size="sm"
          className="self-start"
          disabled={isPending || !email.trim() || !name.trim()}
          onClick={handleInvite}
        >
          Пригласить
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Имя</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Роль</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Последний вход</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {admins.map((admin) => (
              <TableRow key={admin.id}>
                <TableCell>{admin.name}</TableCell>
                <TableCell>{admin.email}</TableCell>
                <TableCell>
                  {admin.isOwner ? (
                    <Badge variant="destructive">Головной аккаунт</Badge>
                  ) : (
                    <Select
                      value={admin.platformRoleId ?? "__none__"}
                      onValueChange={(v) => handleRoleChange(admin.id, v ?? "__none__")}
                    >
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Без роли</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {!admin.hasCompletedSetup ? (
                    <Badge variant="secondary">Ожидает настройки</Badge>
                  ) : (
                    <Badge variant={admin.status === "ACTIVE" ? "default" : "secondary"}>
                      {admin.status === "ACTIVE" ? "Активен" : "Отключён"}
                    </Badge>
                  )}
                  {!admin.isOwner && admin.id !== currentAdminId && admin.hasCompletedSetup && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleStatusToggle(admin.id, admin.status)}
                    >
                      {admin.status === "ACTIVE" ? "Отключить" : "Включить"}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{admin.lastLoginAt ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
