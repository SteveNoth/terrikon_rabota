/** Адрес карточки. Slug уже человекопонятный и уникальный (в сидах — название плюс якорь). */
export function vacancyPath(citySlug: string, slug: string): string {
  return `/${citySlug}/job/${slug}`;
}

export function vacancyApplyHref(vacancyId: string): string {
  return `/profile/apply/${vacancyId}`;
}

export function employerVacanciesHref(citySlug: string, employerSlug: string, vahta: boolean): string {
  const section = vahta ? "vahta" : "jobs";
  return `/${citySlug}/${section}?employer=${encodeURIComponent(employerSlug)}`;
}
