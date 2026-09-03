import { AuthNotice } from "@/components/auth/AuthNotice";
import { SupportThanksNote } from "@/components/support/SupportThanksNote";
import { ProfileNav } from "@/components/seeker/ProfileNav";
import { SeekerCityFilter } from "@/components/seeker/SeekerCityFilter";
import { getUser } from "@/lib/adapters/auth";
import { firstQuery } from "@/lib/auth/next-path";
import { formatDate } from "@/lib/format/date";
import { listSeekerApplications } from "@/lib/repo/seeker";
import { SEEKER_APPLICATION_STATUS_LABEL } from "@/lib/seeker/labels";
import { VACANCY_CLOSED_LABEL } from "@/lib/seeker/constants";
import { isListedSeekerCity } from "@/lib/seeker/city-filter";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Мои отклики | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getUser();
  if (!user) {
    notFound();
  }
  const query = await searchParams;
  const requested = firstQuery(query.city);
  const filterCity = requested && isListedSeekerCity(requested) ? requested : null;
  const rows = await listSeekerApplications(user.id, filterCity);
  const notice = firstQuery(query.notice);
  const thanksNext = notice
    ? `/profile/applications?notice=${encodeURIComponent(notice)}`
    : "/profile/applications";

  return (
    <>
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Мои отклики</h1>
        <ProfileNav current="/profile/applications" />
      </header>
      <AuthNotice query={query} />
      {notice ? <SupportThanksNote nextPath={thanksNext} /> : null}
      <SeekerCityFilter action="/profile/applications" current={filterCity} />
      {rows.length === 0 ? (
        <p className="text-md text-muted">Пока нет откликов в выбранном городе.</p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-4">
          {rows.map((row) => (
            <li key={row.id} className="min-w-0 border-b border-border pb-4">
              <p>
                <Link href={row.href} className="text-brand underline-offset-2 hover:underline">
                  {row.vacancyTitle}
                </Link>
                {row.closed ? <span className="text-muted"> · {VACANCY_CLOSED_LABEL}</span> : null}
              </p>
              <p className="text-sm text-muted">
                {row.cityName} · {SEEKER_APPLICATION_STATUS_LABEL[row.status]} · {formatDate(row.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
