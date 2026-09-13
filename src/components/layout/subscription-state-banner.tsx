import Link from "next/link";
import type { Role } from "@/generated/prisma/enums";
import type { SubscriptionState } from "@/lib/subscription";

const STYLE_BY_KIND: Record<string, string> = {
  TRIAL: "border-blue-300 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  GRACE: "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  RESTRICTED: "border-destructive bg-destructive/10 text-destructive",
};

/**
 * Блок Q — a persistent, org-wide notice for every state except ACTIVE, so
 * a mutation failing with "подписка не активна" (see assertPermission's
 * gate in lib/permissions.ts) never comes as a surprise. Shown to
 * everyone in the org (a RESTRICTED org blocks every member's edits, not
 * just the admin's), but only ADMIN gets the actionable link — everyone
 * else is told to ask their admin instead.
 */
export function SubscriptionStateBanner({ org, role, state }: { org: string; role: Role; state: SubscriptionState }) {
  let message: string;
  if (state.kind === "TRIAL") {
    message = `Пробный период — осталось до ${state.endsAt.toLocaleDateString("ru-RU")}.`;
  } else if (state.kind === "GRACE") {
    message = `Оплата тарифа «${state.plan.name}» не прошла — доступ ограничится ${state.graceEndsAt.toLocaleDateString("ru-RU")}, если баланс не пополнить.`;
  } else {
    message = "Доступ ограничен до просмотра — подписка не активна.";
  }

  return (
    <div className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-sm sm:px-6 ${STYLE_BY_KIND[state.kind] ?? ""}`}>
      <span>{message}</span>
      {role === "ADMIN" ? (
        <Link href={`/${org}/settings/subscription`} className="shrink-0 font-medium underline">
          Перейти к подписке
        </Link>
      ) : (
        <span className="shrink-0 text-xs opacity-80">Обратитесь к администратору организации</span>
      )}
    </div>
  );
}
