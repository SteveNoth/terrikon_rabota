import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { listAdminVacancies, type AdminVacancyFilters } from "@/lib/admin/vacancies";
import { bulkVacanciesAction } from "@/app/admin/actions";
import { AdminNotice, firstParam } from "@/app/admin/notice";
import { buttonVariants } from "@/components/ui/button-variants";
import { getAllCities } from "@/lib/geo";
import { listSpheres } from "@/lib/professions";
import { SOURCE_LABEL } from "@/lib/format/source";
import { SOURCE_OPTIONS } from "@/lib/admin/constants";
import { formatDate } from "@/lib/format/date";

export default async function VacanciesAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const query = await searchParams;
  const filters: AdminVacancyFilters = {
    city: firstParam(query.city),
    status: firstParam(query.status),
    source: firstParam(query.source),
    sphere: firstParam(query.sphere),
    q: firstParam(query.q),
    from: firstParam(query.from),
    to: firstParam(query.to),
    hasReports: firstParam(query.hasReports) === "1",
    page: Number(firstParam(query.page) || "1") || 1,
  };
  const data = await listAdminVacancies(filters);
  const cities = getAllCities();
  const spheres = listSpheres();

  return (
    <>
      <AdminNotice query={query} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl">Вакансии</h1>
        <Link href="/admin/vacancies/new" className={buttonVariants({ variant: "primary", size: "sm" })}>
          Добавить вручную
        </Link>
      </div>
      <form method="get" className="admin-filters">
        <label className="admin-field">
          Город
          <select name="city" defaultValue={filters.city ?? ""}>
            <option value="">все</option>
            {cities.map((city) => (
              <option key={city.slug} value={city.slug}>
                {city.name.nom} ({city.status})
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          Статус
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">все</option>
            <option value="AUTO_OK">AUTO_OK</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="BLOCKED">BLOCKED</option>
          </select>
        </label>
        <label className="admin-field">
          Источник
          <select name="source" defaultValue={filters.source ?? ""}>
            <option value="">все</option>
            {SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>
                {SOURCE_LABEL[source]}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          Сфера
          <select name="sphere" defaultValue={filters.sphere ?? ""}>
            <option value="">все</option>
            {spheres.map((sphere) => (
              <option key={sphere.slug} value={sphere.slug}>
                {sphere.name}
              </option>
            ))}
          </select>
        </label>
        <label className="admin-field">
          С
          <input type="date" name="from" defaultValue={filters.from ?? ""} />
        </label>
        <label className="admin-field">
          По
          <input type="date" name="to" defaultValue={filters.to ?? ""} />
        </label>
        <label className="admin-field admin-filters-wide">
          Поиск
          <input name="q" defaultValue={filters.q ?? ""} />
        </label>
        <label className="admin-field">
          Жалобы
          <span className="admin-check">
            <input type="checkbox" name="hasReports" value="1" defaultChecked={filters.hasReports} />
            есть жалобы
          </span>
        </label>
        <div className="admin-field">
          <span className="admin-kicker">Найти</span>
          <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Показать
          </button>
        </div>
      </form>

      {data.soonEmpty ? (
        <p className="mt-6">Вакансий в этом городе пока нет — город в процессе разработки.</p>
      ) : (
        <form action={bulkVacanciesAction} className="mt-4">
          <div className="admin-actions">
            <button type="submit" name="bulk" value="activate" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Активировать
            </button>
            <button type="submit" name="bulk" value="deactivate" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Деактивировать
            </button>
            <button type="submit" name="bulk" value="delete" className={buttonVariants({ variant: "danger", size: "sm" })}>
              Удалить
            </button>
          </div>
          <p className="admin-kicker mt-2">Всего {data.total}</p>
          <table className="admin-table mt-3">
            <thead>
              <tr>
                <th />
                <th>Название</th>
                <th>Город</th>
                <th>Источник</th>
                <th>Статус</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" name="ids" value={row.id} />
                  </td>
                  <td>
                    <Link href={`/admin/vacancies/${row.id}`}>{row.title}</Link>
                    {row.reportCount ? ` · жалоб ${row.reportCount}` : ""}
                    {row.employerInn ? ` · ИНН ${row.employerInn}` : ""}
                    {row.salaryIsGross ? " · до вычета" : ""}
                  </td>
                  <td>{row.cityName}</td>
                  <td>{row.sourceName || SOURCE_LABEL[row.source]}</td>
                  <td>
                    {row.moderationStatus}
                    {row.isActive ? "" : " · выкл"}
                  </td>
                  <td>{formatDate(row.publishedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </form>
      )}
    </>
  );
}
