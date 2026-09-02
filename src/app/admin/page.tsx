import { loadOverview } from "@/lib/admin/overview";
import { isAdminRequest } from "@/lib/admin/auth";
import { loginAction } from "@/app/admin/actions";
import { buttonVariants } from "@/components/ui/button-variants";
import { AdminNotice } from "@/app/admin/notice";

export default async function AdminHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const loggedIn = await isAdminRequest();
  if (!loggedIn) {
    return <LoginForm error={first(query.error)} />;
  }

  const data = await loadOverview();
  return (
    <>
      <AdminNotice query={query} />
      <h1 className="text-xl">Обзор</h1>
      <p className="admin-kicker mt-2">
        Очередь постов: {data.queueSize}
        {data.oldestQueue ? ` · самый старый пункт ждёт ${data.oldestQueue}` : ""}. Очередь кабинета:{" "}
        {data.employerQueueSize}
        {data.oldestEmployerQueue ? ` · самый старый пункт ждёт ${data.oldestEmployerQueue}` : ""}. Это то, что нужно
        видеть каждый день.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Активных вакансий" value={String(data.activeTotal)} />
        <Stat label="За 7 дней" value={String(data.new7d)} />
        <Stat label="Подписчики бота" value={String(data.botSubscribers)} />
        <Stat label="База" value={`${data.dbShare} лимита`} hint={data.dbLabel} />
      </div>
      <h2 className="mt-6 text-lg">По городам</h2>
      <ul>
        {data.byCity.map((row) => (
          <li key={row.slug}>
            {row.name}: {row.count}
          </li>
        ))}
      </ul>
      <h2 className="mt-6 text-lg">По сферам</h2>
      <ul>
        {data.bySphere.map((row) => (
          <li key={row.slug}>
            {row.name}: {row.count}
          </li>
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="admin-stat">
      <span className="admin-kicker">{label}</span>
      <b>{value}</b>
      {hint ? <span className="admin-kicker">{hint}</span> : null}
    </div>
  );
}

function LoginForm({ error }: { error?: string }) {
  return (
    <div className="admin-login">
      <h1 className="text-xl">Вход в админку</h1>
      <p className="mt-3 text-sm text-muted">
        Один общий пароль из <code>ADMIN_PASSWORD</code>, сессия в подписанной cookie. Это осознанно простое решение
        для одного администратора: нет ролей, нет двухфакторной проверки, нет учётки в базе. Ограничения — украденная
        cookie даёт доступ до истечения срока или смены пароля; сменить пароль можно только в окружении и новым
        деплоем; без пароля в env админка закрыта целиком.
      </p>
      {error ? <p className="admin-notice admin-notice-error mt-3">{error}</p> : null}
      <form action={loginAction} className="mt-4">
        <label className="admin-field">
          Пароль
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className={buttonVariants({ variant: "primary" })}>
          Войти
        </button>
      </form>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
