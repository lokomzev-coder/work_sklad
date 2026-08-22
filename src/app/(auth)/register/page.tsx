"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { registerAction, type ActionResult } from "@/actions/auth";
import { slugify } from "@/lib/slug";
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

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );
  const [orgName, setOrgName] = useState("");
  const [login, setLogin] = useState("");

  const orgSlugPreview = orgName ? slugify(orgName) : "";
  const loginPreview = login.trim().toLowerCase() || "login";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Регистрация</CardTitle>
        <CardDescription>
          Создайте аккаунт и организацию
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="orgName">Название организации</Label>
            <Input
              id="orgName"
              name="orgName"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Ваше имя</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="login">Логин</Label>
            <Input
              id="login"
              name="login"
              placeholder="ivan"
              autoCapitalize="off"
              autoCorrect="off"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
            />
            {orgSlugPreview && (
              <p className="text-xs text-muted-foreground">
                Вход будет по логину: {loginPreview}@{orgSlugPreview}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={8}
              required
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Создание..." : "Зарегистрироваться"}
          </Button>
          <p className="text-sm text-muted-foreground">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-primary underline">
              Войти
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
