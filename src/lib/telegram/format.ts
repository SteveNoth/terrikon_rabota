import { formatDate } from "@/lib/format/date";
import { formatMoney } from "@/lib/format/money";
import { districtName, getCity } from "@/lib/geo";
import { vacancyPath } from "@/lib/vacancy/path";
import type { VacancyListItem } from "@/lib/repo/vacancies";
import { WorkFormat } from "@prisma/client";

export function publicSiteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  return "https://terrikon-rabota.vercel.app";
}

export function vacancyPublicUrl(citySlug: string, slug: string): string {
  return `${publicSiteOrigin()}${vacancyPath(citySlug, slug)}`;
}

export function formatVacancyMessage(item: VacancyListItem): string {
  const salary = formatMoney({
    salaryFrom: item.salaryFrom,
    salaryTo: item.salaryTo,
    salaryPeriod: item.salaryPeriod,
  });
  const district = districtName(item.citySlug, item.districtSlug);
  const city = getCity(item.citySlug)?.name.nom ?? item.citySlug;
  const when = formatDate(item.publishedAt);
  const lines = [item.title];

  if (item.workFormat === WorkFormat.VAHTA) {
    const work = item.workLocationText || item.workCitySlug || "вахта";
    lines.push(`Работа: ${work}`);
    lines.push(`Набор: ${city}`);
  } else if (district) {
    lines.push(district);
  }

  lines.push(salary);
  if (when) {
    lines.push(when);
  }
  lines.push("");
  lines.push(vacancyPublicUrl(item.citySlug, item.slug));
  return lines.join("\n");
}
