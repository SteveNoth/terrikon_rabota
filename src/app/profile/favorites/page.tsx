import { AuthNotice } from "@/components/auth/AuthNotice";
import { ProfileNav } from "@/components/seeker/ProfileNav";
import { SeekerCityFilter } from "@/components/seeker/SeekerCityFilter";
import { getUser } from "@/lib/adapters/auth";
import { firstQuery } from "@/lib/auth/next-path";
import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { listSeekerFavorites } from "@/lib/repo/seeker";
import { FAVORITE_GUEST_WHY, VACANCY_CLOSED_LABEL } from "@/lib/seeker/constants";
import { isListedSeekerCity } from "@/lib/seeker/city-filter";
import type { Metadata } from "next";
import type { SalaryPeriod } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Избранное | Террикон Работа",
  robots: { index: false, follow: false },
};

export default async function FavoritesPage({
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
  const rows = await listSeekerFavorites(user.id, filterCity);

  return (
    <>
      <header className="flex min-w-0 flex-col gap-2">
        <h1 className="font-display text-2xl font-medium">Избранное</h1>
        <ProfileNav current="/profile/favorites" />
      </header>
      <AuthNotice query={query} />
      <p className="max-w-xl text-sm text-muted">{FAVORITE_GUEST_WHY}</p>
      <SeekerCityFilter action="/profile/favorites" current={filterCity} />
      {rows.length === 0 ? (
        <p className="text-md text-muted">
          Пока пусто. Нажмите «В избранное» на карточке — даже без входа. После входа закладки из браузера появятся здесь.
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-4">
          {rows.map((row) => (
            <li key={row.vacancyId} className="min-w-0 border-b border-border pb-4">
              <p>
                <Link href={row.href} className="text-brand underline-offset-2 hover:underline">
                  {row.title}
                </Link>
                {row.closed ? <span className="text-muted"> · {VACANCY_CLOSED_LABEL}</span> : null}
              </p>
              <p className="text-sm text-muted">
                {row.cityName}
                {` · ${formatMoney({
                  salaryFrom: row.salaryFrom,
                  salaryTo: row.salaryTo,
                  salaryPeriod: row.salaryPeriod as SalaryPeriod,
                })}`}
                {` · ${formatDate(row.addedAt)}`}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
