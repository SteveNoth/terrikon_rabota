import { VacancyCard } from "@/components/vacancy/VacancyCard";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { SmartImage } from "@/components/ui/SmartImage";
import { cityName, cityStaticParams, isActiveCity, isSelectableCity } from "@/lib/geo";
import { getSphere } from "@/lib/professions";
import { getRequestQuality } from "@/lib/quality/request";
import { listVacancies } from "@/lib/repo/vacancies";
import { getPublicEmployer } from "@/lib/repo/sitemap";
import { pageMetadata } from "@/lib/seo/meta";
import { companyDescription, companyTitle } from "@/lib/seo/titles";
import { companyPath } from "@/lib/vacancy/path";
import { WorkFormat } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return cityStaticParams();
}

export const dynamicParams = true;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}): Promise<Metadata> {
  const { city, slug } = await params;
  if (!isSelectableCity(city)) {
    return { title: "Работодатель", robots: { index: false, follow: false } };
  }
  const employer = await getPublicEmployer(slug);
  if (!employer || employer.citySlug !== city) {
    return { title: "Работодатель не найден", robots: { index: false, follow: false } };
  }
  return pageMetadata({
    title: companyTitle(employer.name, city),
    description: companyDescription(employer.name, city),
    pathname: companyPath(city, slug),
  });
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { city, slug } = await params;
  if (!isSelectableCity(city) || !isActiveCity(city)) {
    notFound();
  }

  const employer = await getPublicEmployer(slug);
  if (!employer || employer.citySlug !== city) {
    notFound();
  }

  const [{ features }, local, vahta] = await Promise.all([
    getRequestQuality(),
    listVacancies({
      citySlug: city,
      employerSlug: slug,
      workFormat: WorkFormat.LOCAL,
      pageSize: 50,
    }),
    listVacancies({
      citySlug: city,
      employerSlug: slug,
      workFormat: WorkFormat.VAHTA,
      pageSize: 50,
    }),
  ]);

  const sphere = getSphere(employer.sphere);
  const website = employer.website?.trim();

  return (
    <article className="mx-auto flex w-full max-w-container min-w-0 flex-col gap-6 px-4 py-8">
      <p className="text-sm">
        <Link href={`/${city}/jobs`} className="text-brand underline-offset-2 hover:underline">
          К вакансиям {cityName(city, "gen")}
        </Link>
      </p>
      <header className="flex min-w-0 flex-col gap-3">
        <p className="flex min-w-0 flex-wrap items-center gap-3">
          <SmartImage src={employer.logoUrl} name={employer.name} size="lg" />
          <span className="min-w-0 break-words font-display text-2xl font-medium">{employer.name}</span>
          {employer.isVerified ? (
            <Badge tone="success" className="inline-flex items-center gap-1">
              <Icon name="check" size="sm" decorative />
              Проверено
            </Badge>
          ) : null}
        </p>
        <p className="text-md text-muted">
          {cityName(city, "nom")}
          {sphere ? ` · ${sphere.name}` : ""}
        </p>
        {employer.description ? (
          <p className="max-w-xl min-w-0 break-words">{employer.description}</p>
        ) : (
          <p className="max-w-xl text-md text-muted">
            Карточка собрана по объявлениям. Это не страница предприятия на нашем сайте «от лица
            компании», если вакансии пришли из групп и каналов.
          </p>
        )}
        {website ? (
          <p>
            <a
              href={website}
              rel="noopener noreferrer"
              className="text-brand underline-offset-2 hover:underline"
            >
              Сайт работодателя
            </a>
          </p>
        ) : null}
      </header>

      <section className="flex min-w-0 flex-col gap-3">
        <h2 className="font-display text-xl font-medium">Местные вакансии</h2>
        {local.vacancies.length === 0 ? (
          <p className="text-md text-muted">Сейчас нет местных объявлений этой компании.</p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-3">
            {local.vacancies.map((vacancy) => (
              <li key={vacancy.id} className="min-w-0">
                <VacancyCard vacancy={vacancy} features={features} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {vahta.vacancies.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="font-display text-xl font-medium">Вахта</h2>
          <p className="text-sm text-muted">Работа не в этом городе. Набор идёт отсюда.</p>
          <ul className="flex min-w-0 flex-col gap-3">
            {vahta.vacancies.map((vacancy) => (
              <li key={vacancy.id} className="min-w-0">
                <VacancyCard vacancy={vacancy} features={features} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}
