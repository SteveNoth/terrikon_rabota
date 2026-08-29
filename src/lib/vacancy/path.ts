/** Адрес карточки. Slug уже человекопонятный и уникальный (в сидах — название плюс якорь). */
export function vacancyPath(citySlug: string, slug: string): string {
  return `/${citySlug}/job/${slug}`;
}

export function vacancyApplyHref(citySlug: string, slug: string): string {
  const next = vacancyPath(citySlug, slug);
  return `/login?next=${encodeURIComponent(next)}`;
}

export function employerVacanciesHref(citySlug: string, employerSlug: string, vahta: boolean): string {
  const section = vahta ? "vahta" : "jobs";
  return `/${citySlug}/${section}?employer=${encodeURIComponent(employerSlug)}`;
}
