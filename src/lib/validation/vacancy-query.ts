import { z } from "zod";
import { getCity, getDefaultCity, getDistricts, getExternalDestination } from "@/lib/geo";
import type { VacancySort } from "@/lib/repo/vacancies";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/repo/vacancies";

/**
 * Зачем проверять то, что пришло из адресной строки
 * -----------------------------------------------
 * Адрес — это не форма с кнопками, которую мы сами нарисовали. Его может
 * набрать человек руками, прислать мессенджер, дописать поисковик или
 * подставить бот. Там бывает `page=-5`, `sort=абракадабра`, пустая строка
 * вместо города.
 *
 * Если отдать такое в базу «как есть», страница упадёт: Prisma получит
 * отрицательный skip или неизвестную сортировку. Для человека это выглядит
 * как «сайт сломался», хотя он всего лишь ошибся в ссылке.
 *
 * Поэтому разбор через zod (библиотека схем: «ожидаю число от 1», «ожидаю
 * одно из четырёх слов») здесь не про безопасность паролей. Он про вежливость:
 * неверное значение заменяем на разумное (страница 1, сортировка по дате),
 * и список всё равно открывается.
 */

const SORTS = ["date", "salary", "salary_desc", "salary_asc", "quality"] as const;

const EXPERIENCE = ["NONE", "UP_TO_1", "FROM_1_TO_3", "FROM_3"] as const;
const EMPLOYMENT = ["FULL", "PART", "SHIFT", "TEMPORARY", "REMOTE"] as const;
const SOURCES = ["VK", "TELEGRAM", "WEBSITE", "MANUAL", "EMPLOYER"] as const;
const WORK_FORMATS = ["LOCAL", "VAHTA", "REMOTE"] as const;
const PUBLISHED_DAYS = [1, 3, 7, 30] as const;

export type JobsWorkFormat = (typeof WORK_FORMATS)[number];
export type ParsedSource = (typeof SOURCES)[number];
export type PublishedDays = (typeof PUBLISHED_DAYS)[number];

export type ParsedVacancyQuery = {
  city: string;
  sphere?: string;
  profession?: string;
  salaryFrom?: number;
  schedule?: string;
  experience?: (typeof EXPERIENCE)[number];
  employmentType?: (typeof EMPLOYMENT)[number];
  district?: string;
  q?: string;
  sort: VacancySort;
  page: number;
  pageSize: number;
  workFormat: JobsWorkFormat;
  publishedDays?: PublishedDays;
  hasSalary?: boolean;
  verifiedOnly?: boolean;
  source?: ParsedSource;
  destination?: string;
  vahtaDays?: number;
  rotation?: string;
  housing?: boolean;
  meals?: boolean;
  travel?: boolean;
  direct?: boolean;
};

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function asRecord(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  if (input instanceof URLSearchParams) {
    const record: Record<string, string | undefined> = {};
    for (const key of input.keys()) {
      record[key] = input.get(key) ?? undefined;
    }
    return record;
  }
  const record: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(input)) {
    record[key] = first(value);
  }
  return record;
}

function parsePage(raw: string | undefined): number {
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success || parsed.data < 1) {
    return 1;
  }
  return parsed.data;
}

function parsePageSize(raw: string | undefined): number {
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success || parsed.data < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(parsed.data, MAX_PAGE_SIZE);
}

function parseSort(raw: string | undefined): VacancySort {
  const normalized = raw?.trim().toLowerCase();
  const parsed = z.enum(SORTS).safeParse(normalized);
  if (!parsed.success) {
    return "date";
  }
  return parsed.data;
}

function parseSalaryFrom(raw: string | undefined): number | undefined {
  if (raw == null || raw.trim() === "") {
    return undefined;
  }
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success || parsed.data < 0) {
    return undefined;
  }
  return parsed.data;
}

function parseEnum<T extends string>(
  raw: string | undefined,
  values: readonly T[],
): T | undefined {
  if (!raw) {
    return undefined;
  }
  const upper = raw.trim().toUpperCase();
  const parsed = z.enum(values as [T, ...T[]]).safeParse(upper);
  return parsed.success ? parsed.data : undefined;
}

function parseSlug(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  const parsed = z.string().max(80).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parseCity(raw: string | undefined): string {
  const slug = raw?.trim().toLowerCase();
  if (!slug) {
    return getDefaultCity().slug;
  }
  return slug;
}

function parseSearch(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  return value.slice(0, 120);
}

function parseFlag(raw: string | undefined): boolean | undefined {
  if (!raw) {
    return undefined;
  }
  const value = raw.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "on" || value === "yes") {
    return true;
  }
  return undefined;
}

function parsePublishedDays(raw: string | undefined): PublishedDays | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success) {
    return undefined;
  }
  return (PUBLISHED_DAYS as readonly number[]).includes(parsed.data)
    ? (parsed.data as PublishedDays)
    : undefined;
}

function parseVahtaDays(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }
  const parsed = z.coerce.number().int().safeParse(raw);
  if (!parsed.success || parsed.data < 1 || parsed.data > 365) {
    return undefined;
  }
  return parsed.data;
}

function parseRotation(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) {
    return undefined;
  }
  if (!/^\d{1,3}\/\d{1,3}$/.test(value)) {
    return undefined;
  }
  return value;
}

function parseWorkFormat(raw: string | undefined): JobsWorkFormat {
  const parsed = parseEnum(raw, WORK_FORMATS);
  return parsed ?? "LOCAL";
}

export type ParseVacancyQueryOptions = {
  city?: string;
  pageSize?: number;
  workFormat?: JobsWorkFormat;
};

export function parseVacancyQuery(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  options?: ParseVacancyQueryOptions,
): ParsedVacancyQuery {
  const raw = asRecord(input);
  const city = parseCity(options?.city ?? raw.city);
  const cityMeta = getCity(city);
  const allowedDistricts = cityMeta ? getDistricts(city).map((item) => item.slug) : [];
  const districtRaw = parseSlug(raw.district);
  const district =
    districtRaw && allowedDistricts.includes(districtRaw) ? districtRaw : undefined;

  const parsed: ParsedVacancyQuery = {
    city,
    sort: parseSort(raw.sort),
    page: parsePage(raw.page),
    pageSize: options?.pageSize ?? parsePageSize(raw.pageSize ?? raw.limit),
    workFormat: options?.workFormat ?? parseWorkFormat(raw.workFormat ?? raw.format),
  };

  const sphere = parseSlug(raw.sphere);
  if (sphere) {
    parsed.sphere = sphere;
  }
  const profession = parseSlug(raw.profession ?? raw.professionSlug);
  if (profession) {
    parsed.profession = profession;
  }
  const salaryFrom = parseSalaryFrom(raw.salaryFrom);
  if (salaryFrom != null) {
    parsed.salaryFrom = salaryFrom;
  }
  const schedule = parseSlug(raw.schedule);
  if (schedule) {
    parsed.schedule = schedule;
  }
  const experience = parseEnum(raw.experience, EXPERIENCE);
  if (experience) {
    parsed.experience = experience;
  }
  const employmentType = parseEnum(raw.employmentType ?? raw.employment, EMPLOYMENT);
  if (employmentType) {
    parsed.employmentType = employmentType;
  }
  if (district) {
    parsed.district = district;
  }
  const q = parseSearch(raw.q);
  if (q) {
    parsed.q = q;
  }

  const publishedDays = parsePublishedDays(raw.published);
  if (publishedDays) {
    parsed.publishedDays = publishedDays;
  }
  if (parseFlag(raw.hasSalary)) {
    parsed.hasSalary = true;
  }
  if (parseFlag(raw.verified)) {
    parsed.verifiedOnly = true;
  }
  const source = parseEnum(raw.source, SOURCES);
  if (source) {
    parsed.source = source;
  }

  const destinationRaw = parseSlug(raw.destination);
  if (destinationRaw && getExternalDestination(destinationRaw)) {
    parsed.destination = destinationRaw;
  }
  const vahtaDays = parseVahtaDays(raw.vahtaDays);
  if (vahtaDays != null) {
    parsed.vahtaDays = vahtaDays;
  }
  const rotation = parseRotation(raw.rotation);
  if (rotation) {
    parsed.rotation = rotation;
  }
  if (parseFlag(raw.housing)) {
    parsed.housing = true;
  }
  if (parseFlag(raw.meals)) {
    parsed.meals = true;
  }
  if (parseFlag(raw.travel)) {
    parsed.travel = true;
  }
  if (parseFlag(raw.direct)) {
    parsed.direct = true;
  }

  return parsed;
}

export function isFiltersOpen(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): boolean {
  const raw = asRecord(input);
  return parseFlag(raw.filters) === true;
}
