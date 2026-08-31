import { AuthNotice } from "@/components/auth/AuthNotice";
import { CompanyProfileForm } from "@/components/employer/CompanyProfileForm";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { formatDate } from "@/lib/format/date";
import { vacancyPath } from "@/lib/vacancy/path";
import { TELEGRAM_CHANNEL_URL, telegramChannelTitle } from "@/lib/site";
import { MAX_ACTIVE_VACANCIES, VERIFY_HINT } from "@/lib/auth/constants";
import { APPLICATION_STATUS_LABEL, APPLICATION_STATUS_OPTIONS } from "@/lib/employer/labels";
import { getUser } from "@/lib/adapters/auth";
import {
  countActiveVacancies,
  getEmployerCompany,
  listEmployerApplications,
  listEmployerVacancies,
} from "@/lib/repo/employer";
import { activateVacancyAction, applicationStatusAction, deactivateVacancyAction } from "@/app/employer/actions";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Кабинет работодателя | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function EmployerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user?.employerId) {
    notFound();
  }
  const [company, vacancies, applications, activeCount] = await Promise.all([
    getEmployerCompany(user.employerId),
    listEmployerVacancies(user.employerId),
    listEmployerApplications(user.employerId),
    countActiveVacancies(user.employerId),
  ]);
  if (!company) {
    notFound();
  }
  const query = await searchParams;

  return (
    <>
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Кабинет работодателя</h1>
        <p className="text-md text-muted">
          {user.name} · {user.email}
        </p>
      </header>
      <AuthNotice query={query} />

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Проверка компании</h2>
        {company.isVerified ? (
          <Alert tone="success">Компания отмечена как проверенная администратором.</Alert>
        ) : (
          <Alert tone="info">
            <p>Отметки «проверенный работодатель» пока нет.</p>
            <p className="mt-2">{VERIFY_HINT}</p>
            <p className="mt-2">
              <a href={TELEGRAM_CHANNEL_URL} className="text-brand underline-offset-2 hover:underline">
                {telegramChannelTitle()}
              </a>
            </p>
          </Alert>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Профиль компании</h2>
        <CompanyProfileForm company={company} />
      </section>

      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-medium">Мои вакансии</h2>
          <Link href="/employer/vacancies/new" className={cn(buttonVariants({ variant: "accent", size: "sm" }))}>
            Добавить вакансию
          </Link>
        </div>
        <p className="text-sm text-muted">
          Активных: {activeCount} из {MAX_ACTIVE_VACANCIES}. Больше 20 сразу держать нельзя — защита от спама.
        </p>
        {vacancies.length === 0 ? (
          <p className="text-md text-muted">Пока нет ни одной вакансии.</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium">Вакансия</th>
                  <th className="py-2 pr-3 font-medium">Город</th>
                  <th className="py-2 pr-3 font-medium">Статус</th>
                  <th className="py-2 pr-3 font-medium">Просмотры</th>
                  <th className="py-2 pr-3 font-medium">Отклики</th>
                  <th className="py-2 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {vacancies.map((row) => (
                  <tr key={row.id} className="border-b border-border align-top">
                    <td className="py-3 pr-3">
                      <Link
                        href={vacancyPath(row.citySlug, row.slug)}
                        className="text-brand underline-offset-2 hover:underline"
                      >
                        {row.title}
                      </Link>
                      <p className="text-muted">{formatDate(row.publishedAt)}</p>
                    </td>
                    <td className="py-3 pr-3">{row.cityName}</td>
                    <td className="py-3 pr-3">{row.isActive ? "активна" : "снята"}</td>
                    <td className="py-3 pr-3">{row.viewsCount}</td>
                    <td className="py-3 pr-3">{row.applicationsCount}</td>
                    <td className="py-3">
                      <div className="flex flex-col items-start gap-2">
                        <Link
                          href={`/employer/vacancies/${row.id}`}
                          className="text-brand underline-offset-2 hover:underline"
                        >
                          Редактировать
                        </Link>
                        {row.isActive ? (
                          <form action={deactivateVacancyAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button type="submit" className="text-danger underline-offset-2 hover:underline">
                              Снять с публикации
                            </button>
                          </form>
                        ) : (
                          <form action={activateVacancyAction}>
                            <input type="hidden" name="id" value={row.id} />
                            <button type="submit" className="text-brand underline-offset-2 hover:underline">
                              Опубликовать снова
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex min-w-0 flex-col gap-3" id="applications">
        <h2 className="font-display text-xl font-medium">Отклики</h2>
        {applications.length === 0 ? (
          <p className="text-md text-muted">Откликов пока нет. Когда соискатель откликнется, заявка появится здесь.</p>
        ) : (
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium">Вакансия</th>
                  <th className="py-2 pr-3 font-medium">Соискатель</th>
                  <th className="py-2 pr-3 font-medium">Сообщение</th>
                  <th className="py-2 pr-3 font-medium">Статус</th>
                  <th className="py-2 font-medium">Изменить</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((row) => (
                  <tr key={row.id} className="border-b border-border align-top">
                    <td className="py-3 pr-3">
                      <Link
                        href={vacancyPath(row.citySlug, row.vacancySlug)}
                        className="text-brand underline-offset-2 hover:underline"
                      >
                        {row.vacancyTitle}
                      </Link>
                      <p className="text-muted">{formatDate(row.createdAt)}</p>
                    </td>
                    <td className="py-3 pr-3">
                      {row.applicantName}
                      <p className="text-muted">{row.applicantEmail}</p>
                    </td>
                    <td className="py-3 pr-3">{row.message || "—"}</td>
                    <td className="py-3 pr-3">{APPLICATION_STATUS_LABEL[row.status]}</td>
                    <td className="py-3">
                      <form action={applicationStatusAction} className="flex min-w-0 flex-wrap items-center gap-2">
                        <input type="hidden" name="id" value={row.id} />
                        <select name="status" defaultValue={row.status === "SENT" ? "VIEWED" : row.status} className="min-h-tap rounded-md border border-border bg-surface px-2 text-sm">
                          {APPLICATION_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                          Сохранить
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
