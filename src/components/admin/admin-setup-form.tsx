"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { startPlatformAdminSetup, confirmPlatformAdminSetup } from "@/actions/platform-admins";

/** Two-step self-service setup — mirrors scripts/create-platform-owner.ts's
 * CLI flow (set password → show QR → confirm a real code from it) as a web
 * form. Nobody but the admin completing this page ever sees their own TOTP
 * secret — see invitePlatformAdmin's own comment for why that matters. */
export function AdminSetupForm({ token, adminBasePath }: { token: string; adminBasePath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [step, setStep] = useState<"password" | "totp" | "done">("password");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [base32, setBase32] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handlePasswordSubmit() {
    setError(null);
    if (password.length < 12) {
      setError("Пароль должен быть не короче 12 символов");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Пароли не совпадают");
      return;
    }
    startTransition(async () => {
      const result = await startPlatformAdminSetup(token, password);
      if (result.error) {
        setError(result.error);
        return;
      }
      setQrDataUrl(result.qrDataUrl ?? null);
      setBase32(result.base32 ?? null);
      setStep("totp");
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await confirmPlatformAdminSetup(token, code);
      if (result.error) {
        setError(result.error);
        return;
      }
      setStep("done");
      toast.success("Готово — теперь можно войти");
      setTimeout(() => router.push(`${adminBasePath}/login`), 1500);
    });
  }

  if (step === "done") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Настройка завершена</CardTitle>
          <CardDescription>Сейчас вы будете перенаправлены на страницу входа</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (step === "totp") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Настройте двухфакторную аутентификацию</CardTitle>
          <CardDescription>
            Отсканируйте QR-код в приложении-аутентификаторе (Google Authenticator и т.п.), затем введите код
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- data: URL, no next/image benefit
            <img src={qrDataUrl} alt="QR-код для настройки 2FA" className="size-48" />
          )}
          {base32 && (
            <p className="text-center text-xs text-muted-foreground break-all">
              Если не получается отсканировать — введите вручную: {base32}
            </p>
          )}
          <div className="flex w-full flex-col gap-2">
            <Label htmlFor="code">Код из приложения</Label>
            <Input
              id="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
        <CardFooter>
          <Button type="button" className="w-full" disabled={isPending || code.length !== 6} onClick={handleConfirm}>
            {isPending ? "Проверяем..." : "Подтвердить"}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Настройка аккаунта</CardTitle>
        <CardDescription>Задайте пароль для входа в панель разработчика</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Пароль (не короче 12 символов)</Label>
          <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="passwordConfirm">Повторите пароль</Label>
          <Input
            id="passwordConfirm"
            type="password"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button type="button" className="w-full" disabled={isPending} onClick={handlePasswordSubmit}>
          {isPending ? "Сохраняем..." : "Продолжить"}
        </Button>
      </CardFooter>
    </Card>
  );
}
