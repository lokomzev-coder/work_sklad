"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction, type ActionResult } from "@/actions/auth";
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

const initialState: ActionResult = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Вход</CardTitle>
        <CardDescription>Войдите в свой аккаунт</CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="loginId">Логин</Label>
            <Input
              id="loginId"
              name="loginId"
              placeholder="login@организация"
              autoCapitalize="off"
              autoCorrect="off"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Пароль</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Вход..." : "Войти"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Нет аккаунта?{" "}
            <Link href="/register" className="text-primary underline">
              Зарегистрироваться
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
