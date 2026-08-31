import { requireAdmin } from "@/lib/admin/auth";
import { listAdminEmployers } from "@/lib/admin/employers";
import { employerVerifyAction } from "@/app/admin/actions";
import { AdminNotice } from "@/app/admin/notice";
import { cityDisplayName } from "@/lib/geo";

export default async function EmployersAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const rows = await listAdminEmployers();
  const query = await searchParams;

  return (
    <>
      <h1 className="text-xl">Работодатели</h1>
      <p className="mt-2">
        Отметку «проверенный» ставит только эта страница. В кабинете работодателя кнопки нет — там написано, как
        получить проверку.
      </p>
      <AdminNotice query={query} />
      <table className="admin-table mt-4">
        <thead>
          <tr>
            <th>Компания</th>
            <th>Аккаунт</th>
            <th>Город</th>
            <th>Вакансии</th>
            <th>Проверен</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>Пока нет карточек работодателей с кабинета.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td>
                  {row.name}
                  <div className="admin-kicker">{row.slug}</div>
                </td>
                <td>
                  {row.user ? (
                    <>
                      {row.user.name}
                      <div className="admin-kicker">{row.user.email}</div>
                    </>
                  ) : (
                    <span className="admin-kicker">без аккаунта (из парсера)</span>
                  )}
                </td>
                <td>{cityDisplayName(row.citySlug)}</td>
                <td>{row._count.vacancies}</td>
                <td>
                  <form action={employerVerifyAction}>
                    <input type="hidden" name="id" value={row.id} />
                    <input type="hidden" name="verified" value={row.isVerified ? "false" : "true"} />
                    <button type="submit">{row.isVerified ? "Снять отметку" : "Отметить проверенным"}</button>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}
