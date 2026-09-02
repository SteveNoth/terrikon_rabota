import type { EmploymentType, SalaryPeriod, Source, WorkFormat } from "@prisma/client";
import { salaryGrossNote } from "@/lib/format/money";
import { formatSource, openDataAttribution } from "@/lib/format/source";
import { cityName, cityRegion, districtName, isCitySlug } from "@/lib/geo";
import { getProfession, getSphere } from "@/lib/professions";
import { SITE_NAME } from "@/lib/seo/brand";
import { absoluteUrl } from "@/lib/seo/origin";
import type { VacancyRecord } from "@/lib/repo/vacancies";
import { vacancyPath } from "@/lib/vacancy/path";
import type { VacancyView } from "@/lib/vacancy/view";

const VALID_THROUGH_DAYS = 30;

const SCHEMA_EMPLOYMENT: Record<EmploymentType, string> = {
  FULL: "FULL_TIME",
  PART: "PART_TIME",
  SHIFT: "FULL_TIME",
  TEMPORARY: "TEMPORARY",
  REMOTE: "OTHER",
};

const SALARY_UNIT: Partial<Record<SalaryPeriod, "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR">> = {
  MONTH: "MONTH",
  HOUR: "HOUR",
  SHIFT: "DAY",
};

export type JobPostingInput = {
  id: string;
  slug: string;
  title: string;
  description: string;
  summaryLine?: string | null;
  descriptionParagraphs?: string[];
  citySlug: string;
  districtSlug?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  salaryFrom?: number | null;
  salaryTo?: number | null;
  salaryCurrency?: string | null;
  salaryPeriod?: SalaryPeriod | null;
  salaryIsGross?: boolean | null;
  employmentType?: EmploymentType | null;
  workFormat: WorkFormat;
  workLocationText?: string | null;
  schedule?: string | null;
  hoursPerDay?: number | null;
  sphere: string;
  professionSlug?: string | null;
  publishedAt: Date;
  lastSeenAt: Date;
  isActive: boolean;
  source: Source;
  sourceName?: string | null;
  sourceUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  employer?: {
    name: string;
    slug?: string;
    website?: string | null;
    logoUrl?: string | null;
  } | null;
};

export type JsonLd = Record<string, unknown>;

function isoDate(value: Date): string {
  return value.toISOString();
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function cityLocName(slug: string): string {
  return isCitySlug(slug) ? cityName(slug, "nom") : slug;
}

function descriptionText(input: JobPostingInput): string {
  const parts: string[] = [];
  const summary = input.summaryLine?.trim();
  if (summary) {
    parts.push(summary);
  }
  const body = input.descriptionParagraphs?.filter((item) => item.trim()) ?? [];
  if (body.length > 0) {
    parts.push(...body);
  } else if (input.description.trim()) {
    parts.push(input.description.trim());
  }
  const sourceLabel = formatSource(input.source, input.sourceName);
  const attribution = openDataAttribution(input.source);
  if (attribution) {
    parts.push(attribution.label);
  } else if (input.source === "EMPLOYER") {
    parts.push("Размещено работодателем на Террикон Работа.");
  } else {
    parts.push(
      `Источник объявления: ${sourceLabel}. Террикон Работа — агрегатор: мы не работодатель и не выдаём чужие вакансии за свои.`,
    );
  }
  const gross = salaryGrossNote(input.salaryIsGross);
  if (gross) {
    parts.push(`Зарплата: ${gross}.`);
  }
  return parts.join("\n\n");
}

function salaryNode(input: JobPostingInput): JsonLd | null {
  const from = input.salaryFrom ?? null;
  const to = input.salaryTo ?? null;
  if (from == null && to == null) {
    return null;
  }
  const currency = (input.salaryCurrency || "RUB").toUpperCase();
  const value: JsonLd = { "@type": "QuantitativeValue" };
  if (from != null && to != null) {
    if (from === to) {
      value.value = from;
    } else {
      value.minValue = Math.min(from, to);
      value.maxValue = Math.max(from, to);
    }
  } else if (from != null) {
    value.minValue = from;
  } else {
    value.maxValue = to;
  }
  const unit = input.salaryPeriod ? SALARY_UNIT[input.salaryPeriod] : "MONTH";
  if (unit) {
    value.unitText = unit;
  }
  return {
    "@type": "MonetaryAmount",
    currency,
    value,
  };
}

function jobLocation(input: JobPostingInput): JsonLd {
  const locality = cityLocName(input.citySlug);
  const region = cityRegion(input.citySlug);
  const district = districtName(input.citySlug, input.districtSlug);
  const street = input.workFormat === "VAHTA" ? null : input.address?.trim() || null;
  const address: JsonLd = {
    "@type": "PostalAddress",
    addressLocality: locality,
    addressCountry: "RU",
  };
  if (region) {
    address.addressRegion = region.nameFull;
  }
  if (district) {
    address.addressRegion = region
      ? `${region.nameFull}, ${district}`
      : district;
  }
  if (street) {
    address.streetAddress = street;
  }
  if (input.workFormat === "VAHTA" && input.workLocationText?.trim()) {
    address.streetAddress = input.workLocationText.trim();
  }

  const place: JsonLd = {
    "@type": "Place",
    address,
  };
  if (
    input.workFormat !== "VAHTA" &&
    input.latitude != null &&
    input.longitude != null
  ) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: input.latitude,
      longitude: input.longitude,
    };
  }
  return place;
}

function hiringOrganization(input: JobPostingInput): JsonLd {
  if (input.employer?.name.trim()) {
    const org: JsonLd = {
      "@type": "Organization",
      name: input.employer.name.trim(),
    };
    if (input.employer.website?.trim()) {
      org.url = input.employer.website.trim();
      org.sameAs = input.employer.website.trim();
    }
    if (input.employer.logoUrl?.trim()) {
      org.logo = input.employer.logoUrl.trim();
    }
    return org;
  }
  return {
    "@type": "Organization",
    name: "Работодатель не указан",
    description:
      "Название компании в объявлении не указано. Это чужая вакансия, не вакансия Террикон Работа.",
  };
}

function applicationContact(input: JobPostingInput): JsonLd | null {
  const telephone = input.contactPhone?.trim();
  const email = input.contactEmail?.trim();
  if (!telephone && !email) {
    return null;
  }
  const point: JsonLd = {
    "@type": "ContactPoint",
    contactType: "HR",
  };
  if (telephone) {
    point.telephone = telephone;
  }
  if (email) {
    point.email = email;
  }
  return point;
}

/** JobPosting для Яндекса и Google. Источник обязателен, чужое не выдаём за своё. */
export function buildJobPosting(input: JobPostingInput, pageUrl?: string): JsonLd {
  const url = pageUrl ?? absoluteUrl(vacancyPath(input.citySlug, input.slug));
  const sourceLabel = formatSource(input.source, input.sourceName);
  const validThrough = input.isActive
    ? addDays(input.lastSeenAt, VALID_THROUGH_DAYS)
    : input.lastSeenAt;

  const posting: JsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: input.title,
    description: descriptionText(input),
    datePosted: isoDate(input.publishedAt),
    validThrough: isoDate(validThrough),
    url,
    identifier: {
      "@type": "PropertyValue",
      name: SITE_NAME,
      value: input.id,
    },
    hiringOrganization: hiringOrganization(input),
    jobLocation: jobLocation(input),
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteUrl("/"),
    },
    inLanguage: "ru",
    directApply: false,
  };

  const salary = salaryNode(input);
  if (salary) {
    posting.baseSalary = salary;
  }

  if (input.employmentType) {
    posting.employmentType = SCHEMA_EMPLOYMENT[input.employmentType];
  } else if (input.workFormat === "VAHTA") {
    posting.employmentType = "TEMPORARY";
  }

  if (input.workFormat === "REMOTE" || input.employmentType === "REMOTE") {
    posting.jobLocationType = "TELECOMMUTE";
    posting.applicantLocationRequirements = {
      "@type": "Country",
      name: "Russia",
    };
  }

  if (input.schedule?.trim()) {
    posting.workHours = input.schedule.trim();
  } else if (input.hoursPerDay) {
    posting.workHours = `${input.hoursPerDay} часов в день`;
  }

  const sphere = getSphere(input.sphere);
  if (sphere) {
    posting.industry = sphere.name;
  }
  const profession = input.professionSlug ? getProfession(input.professionSlug) : undefined;
  if (profession) {
    posting.occupationalCategory = profession.name;
  }

  if (input.sourceUrl?.trim()) {
    posting.sameAs = input.sourceUrl.trim();
    posting.isBasedOn = {
      "@type": "CreativeWork",
      url: input.sourceUrl.trim(),
      name: sourceLabel,
    };
  }

  const contact = applicationContact(input);
  if (contact) {
    posting.applicationContact = contact;
  }

  return posting;
}

export function jobPostingFromVacancy(record: VacancyRecord, view: VacancyView, pageUrl: string): JsonLd {
  const paragraphs =
    view.descriptionParagraphs.length > 0
      ? view.descriptionParagraphs
      : [
          view.descriptionSections?.description,
          ...(view.descriptionSections?.tasks ?? []),
          ...(view.descriptionSections?.requirements ?? []),
          ...(view.descriptionSections?.conditions ?? []),
        ].filter((item): item is string => Boolean(item?.trim()));

  return buildJobPosting(
    {
      id: record.id,
      slug: record.slug,
      title: view.title,
      description: record.description,
      summaryLine: view.summaryLine,
      descriptionParagraphs: paragraphs,
      citySlug: record.citySlug,
      districtSlug: record.districtSlug,
      address: record.address,
      latitude: record.latitude,
      longitude: record.longitude,
      salaryFrom: record.salaryFrom,
      salaryTo: record.salaryTo,
      salaryCurrency: record.salaryCurrency,
      salaryPeriod: record.salaryPeriod,
      salaryIsGross: record.salaryIsGross,
      employmentType: record.employmentType,
      workFormat: record.workFormat,
      workLocationText: record.workLocationText,
      schedule: record.schedule,
      hoursPerDay: record.hoursPerDay,
      sphere: record.sphere,
      professionSlug: record.professionSlug,
      publishedAt: record.publishedAt,
      lastSeenAt: record.lastSeenAt,
      isActive: record.isActive,
      source: record.source,
      sourceName: record.sourceName,
      sourceUrl: record.sourceUrl,
      contactPhone: record.contactPhone,
      contactEmail: record.contactEmail,
      employer: record.employer
        ? {
            name: record.employer.name,
            slug: record.employer.slug,
            logoUrl: record.employer.logoUrl,
            website: record.employer.website,
          }
        : null,
    },
    pageUrl,
  );
}
