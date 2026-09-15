// Block T (2026-09-15): rendered by proxy.ts's maintenance-mode gate for
// every request that lacks a valid bypass cookie — see proxy.ts for how a
// device gets past this. Deliberately has no links back into the app: a
// visitor here is, by definition, not supposed to reach anything else.
export default function MaintenancePage() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Сайт временно в тестовом режиме</h1>
        <p className="mt-4 text-muted-foreground">
          Доступ имеют только авторизованные пользователи. Если вам нужен
          доступ — обратитесь к техническому администратору.
        </p>
      </div>
    </div>
  );
}
