import { AccountBlockScope, UserRole } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminUsers } from "@/lib/auth/blocks";
import { userBlockAction, userLiftAction } from "@/app/admin/actions";
import { AdminNotice, firstParam } from "@/app/admin/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import { cityDisplayName } from "@/lib/geo";
import Link from "next/link";

function asRole(value: string | undefined): UserRole | "" {
  if (value === "SEEKER" || value === "EMPLOYER" || value === "ADMIN") {
    return value;
  }
  return "";
}

function asBlock(value: string | undefined): AccountBlockScope | "" {
  if (value === "PUBLISH" || value === "APPLY" || value === "LOGIN") {
    return value;
  }
  return "";
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const role = asRole(firstParam(query.role));
  const email = firstParam(query.email) ?? "";
  const block = asBlock(firstParam(query.block));
  const rows = await listAdminUsers({ role, email, block });

  return (
    <>
      <h1 className="text-xl">Аккаунты</h1>
      <p className="mt-2">
        Соискатель без компании тоже виден. APPLY закрывает отклик, LOGIN — вход с той же фразой, что «аккаунт
        заблокирован». PUBLISH для работодателя лучше ставить со страницы работодателей: там виден каскад.
      </p>
      <AdminNotice query={query} />
      <form method="get" className="admin-filters mt-4">
        <label className="admin-field">
          Роль
          <select name="role" defaultValue={role}>
            <option value="">все</option>
            <option value="SEEKER">соискатель</option>
            <option value="EMPLOYER">работодатель</option>
            <option value="ADMIN">админ</option>
          </select>
        </label>
        <label className="admin-field">
          Email
          <input name="email" type="search" defaultValue={email} />
        </label>
        <label className="admin-field">
          Блок
          <select name="block" defaultValue={block}>
            <option value="">все</option>
            <option value="PUBLISH">публикация</option>
            <option value="APPLY">отклик</option>
            <option value="LOGIN">вход</option>
          </select>
        </label>
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Показать
        </button>
      </form>
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Человек</th>
            <th>Роль</th>
            <th>Город</th>
            <th>Блоки</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>Никого не нашлось.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  <div className="admin-kicker">{row.email}</div>
                  {row.employerId ? (
                    <Link href={`/admin/employers/queue?employerId=${row.employerId}`}>
                      {row.employerName || "очередь кабинета"}
                    </Link>
                  ) : (
                    <span className="admin-kicker">без компании</span>
                  )}
                </td>
                <td>{row.role === "SEEKER" ? "соискатель" : row.role === "EMPLOYER" ? "работодатель" : "админ"}</td>
                <td>{cityDisplayName(row.citySlug)}</td>
                <td>
                  {row.publishBlocked ? "PUBLISH " : ""}
                  {row.applyBlocked ? "APPLY " : ""}
                  {row.loginBlocked ? "LOGIN" : ""}
                  {!row.publishBlocked && !row.applyBlocked && !row.loginBlocked ? "нет" : ""}
                </td>
                <td>
                  <div className="admin-actions">
                    {row.applyBlocked ? (
                      <form action={userLiftAction}>
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="scope" value="APPLY" />
                        <button type="submit">Снять APPLY</button>
                      </form>
                    ) : (
                      <form action={userBlockAction}>
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="scope" value="APPLY" />
                        <button type="submit">Закрыть отклик</button>
                      </form>
                    )}
                    {row.loginBlocked ? (
                      <form action={userLiftAction}>
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="scope" value="LOGIN" />
                        <button type="submit">Снять LOGIN</button>
                      </form>
                    ) : (
                      <form action={userBlockAction}>
                        <input type="hidden" name="userId" value={row.id} />
                        <input type="hidden" name="scope" value="LOGIN" />
                        <button type="submit">Закрыть вход</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
