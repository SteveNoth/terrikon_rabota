/** Адрес карточки. Slug уже человекопонятный и уникальный (в сидах — название плюс якорь). */
export function vacancyPath(citySlug: string, slug: string): string {
  return `/${citySlug}/job/${slug}`;
}

export function vacancyApplyHref(vacancyId: string): string {
  return `/profile/apply/${vacancyId}`;
}

export function companyPath(citySlug: string, employerSlug: string): string {
  return `/${citySlug}/company/${employerSlug}`;
}

export function employerVacanciesHref(citySlug: string, employerSlug: string, _vahta?: boolean): string {
  return companyPath(citySlug, employerSlug);
}
