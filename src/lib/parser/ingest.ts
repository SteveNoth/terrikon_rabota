import {
  ContactVerdictKind,
  EmployerKind,
  ModerationStatus,
  Prisma,
  Source,
  WorkFormat,
  type EmploymentType,
  type Experience,
  type SalaryPeriod,
} from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { getDefaultCity } from "@/lib/geo";
import { decideCity } from "@/lib/parser/city";
import { blockReasonForFlags, contactKey } from "@/lib/parser/contact";
import { contentHash, isSha1, samePostUnits, titlesSimilar } from "@/lib/parser/dedupe";
import { uniqueSlug, vacancySlug, employerSlug } from "@/lib/parser/slug";
import { decideModeration } from "@/lib/parser/moderation";
import { qualityScoreFrom } from "@/lib/parser/quality";
import {
  asVersionString,
  isMaybeRecord,
  isSvoRecord,
  parseVacancyRecord,
  sourcePostId,
  truncateDescription,
  type ParserErrorItem,
  type ParserVacancyInput,
} from "@/lib/parser/schema";

export type IngestStats = {
  added: number;
  updated: number;
  duplicates: number;
  pending: number;
  blocked: number;
  skippedCity: number;
  discardedSvo: number;
  maybe: number;
  errors: number;
  errorItems: ParserErrorItem[];
  skippedCityItems: { index: number; externalId: string | null; reason: string }[];
  runId: string;
  elapsedMs: number;
};

type ExistingVacancy = {
  id: string;
  source: Source;
  externalId: string;
  sourcePostExternalId: string;
  slug: string;
  title: string;
  titleNormalized: string;
  citySlug: string;
  contactPhone: string | null;
  contentHash: string;
  signature: string;
  completeness: number;
  firstSeenAt: Date;
  groupId: string | null;
  ocrText: string | null;
  ocrVersion: string | null;
  splitIndex: number;
  moderationStatus: ModerationStatus;
  workFormat: WorkFormat;
  archivedAt: Date | null;
  isActive: boolean;
};

type GroupRow = {
  id: string;
  signature: string;
  primaryVacancyId: string;
  postingsCount: number;
  sourcesCount: number;
  distinctPhonesCount: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  members: {
    id: string;
    source: Source;
    contactPhone: string | null;
    completeness: number;
    firstSeenAt: Date;
    sourcePostExternalId: string;
  }[];
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function asSource(value: ParserVacancyInput["source"]): Source {
  return value as Source;
}

function versionNumber(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldUpdateOcr(
  existing: ExistingVacancy,
  incomingText: string | null,
  incomingVersion: string | null,
): boolean {
  if (!incomingText) {
    return false;
  }
  if (!existing.ocrText) {
    return true;
  }
  return versionNumber(incomingVersion) > versionNumber(existing.ocrVersion);
}

function pairKey(source: Source, externalId: string): string {
  return `${source}::${externalId}`;
}

function cleanInn(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 12) {
    return digits;
  }
  return null;
}

function employerLookupKey(inn: string | null, name: string | null, citySlug: string): string | null {
  if (inn) {
    return `inn:${inn}`;
  }
  const trimmed = name?.trim() ?? "";
  if (trimmed) {
    return `name:${citySlug}:${trimmed}`;
  }
  return null;
}

async function resolveEmployerMap(
  items: { inn: string | null; name: string | null; citySlug: string; sphere: string }[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const inns = [...new Set(items.map((item) => cleanInn(item.inn)).filter((item): item is string => Boolean(item)))];
  if (inns.length) {
    const found = await prisma.employer.findMany({ where: { inn: { in: inns } } });
    for (const row of found) {
      if (row.inn) {
        result.set(`inn:${row.inn}`, row.id);
      }
    }
  }

  const pendingInn = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const inn = cleanInn(item.inn);
    if (inn && !result.has(`inn:${inn}`) && !pendingInn.has(inn)) {
      pendingInn.set(inn, item);
    }
  }
  for (const [inn, item] of pendingInn) {
    const name = item.name?.trim() || `ИНН ${inn}`;
    const slug = employerSlug({ inn, name, citySlug: item.citySlug });
    try {
      const created = await prisma.employer.create({
        data: {
          slug,
          name,
          inn,
          citySlug: item.citySlug,
          sphere: item.sphere || "unknown",
        },
      });
      result.set(`inn:${inn}`, created.id);
    } catch {
      const again = await prisma.employer.findUnique({ where: { inn } });
      if (again) {
        result.set(`inn:${inn}`, again.id);
      }
    }
  }

  for (const item of items) {
    if (cleanInn(item.inn) || !item.name?.trim()) {
      continue;
    }
    const name = item.name.trim();
    const key = `name:${item.citySlug}:${name}`;
    if (result.has(key)) {
      continue;
    }
    const slug = employerSlug({ name, citySlug: item.citySlug });
    const existing = await prisma.employer.findUnique({ where: { slug } });
    if (existing) {
      result.set(key, existing.id);
      continue;
    }
    try {
      const created = await prisma.employer.create({
        data: {
          slug,
          name,
          citySlug: item.citySlug,
          sphere: item.sphere || "unknown",
        },
      });
      result.set(key, created.id);
    } catch {
      const again = await prisma.employer.findUnique({ where: { slug } });
      if (again) {
        result.set(key, again.id);
      }
    }
  }

  return result;
}

export async function ingestVacancies(input: {
  parser: string;
  startedAt: Date;
  items: unknown[];
}): Promise<IngestStats> {
  const started = Date.now();
  const errorItems: ParserErrorItem[] = [];
  const skippedCityItems: IngestStats["skippedCityItems"] = [];
  let discardedSvo = 0;
  let skippedCity = 0;
  let maybeCount = 0;
  let added = 0;
  let updated = 0;
  let duplicates = 0;
  let pending = 0;
  let blocked = 0;
  const rejectReasons: Record<string, number> = {};
  const bumpReason = (reason: string, n = 1) => {
    rejectReasons[reason] = (rejectReasons[reason] ?? 0) + n;
  };

  const parsed: { index: number; record: ParserVacancyInput }[] = [];
  for (let index = 0; index < input.items.length; index += 1) {
    const result = parseVacancyRecord(input.items[index], index);
    if (!result.ok) {
      errorItems.push(result.error);
      bumpReason("ошибка схемы");
      continue;
    }
    parsed.push({ index, record: result.data });
  }

  const vacancyBound = parsed.filter((item) => {
    if (isSvoRecord(item.record)) {
      discardedSvo += 1;
      bumpReason("СВО");
      return false;
    }
    if (isMaybeRecord(item.record)) {
      return false;
    }
    const city = decideCity(item.record.citySlug ?? undefined, item.record.cityName ?? undefined);
    if (!city.ok) {
      skippedCity += 1;
      skippedCityItems.push({
        index: item.index,
        externalId: item.record.externalId,
        reason: city.reason,
      });
      bumpReason("город не active");
      return false;
    }
    return true;
  });

  const maybeItems = parsed.filter((item) => !isSvoRecord(item.record) && isMaybeRecord(item.record));

  const sources = [...new Set(vacancyBound.map((item) => asSource(item.record.source)))];
  const externalIds = [...new Set(vacancyBound.map((item) => item.record.externalId))];
  const hashes = [
    ...new Set(
      vacancyBound.map((item) =>
        isSha1(item.record.contentHash)
          ? item.record.contentHash
          : contentHash(item.record.rawText || item.record.description || "", item.record.contactPhone),
      ),
    ),
  ];
  const phones = [
    ...new Set(
      vacancyBound
        .map((item) => contactKey(item.record.contactPhone, item.record.contactTelegram))
        .filter((item): item is string => Boolean(item)),
    ),
  ];
  const signatures = [...new Set(vacancyBound.map((item) => item.record.signature).filter((item): item is string => Boolean(item)))];
  const citySlugs = [...new Set(vacancyBound.map((item) => item.record.citySlug).filter((item): item is string => Boolean(item)))];

  const defaultCitySlug = getDefaultCity().slug;
  const [existingByPair, existingByHash, verdicts, groups, similarByPhone, slugRows] = await Promise.all([
    externalIds.length
      ? prisma.vacancy.findMany({
          where: { source: { in: sources }, externalId: { in: externalIds } },
          select: existingSelect(),
        })
      : Promise.resolve([] as ExistingVacancy[]),
    hashes.length
      ? prisma.vacancy.findMany({
          where: { contentHash: { in: hashes } },
          select: existingSelect(),
        })
      : Promise.resolve([] as ExistingVacancy[]),
    phones.length
      ? prisma.contactVerdict.findMany({ where: { contact: { in: phones } } })
      : Promise.resolve([]),
    signatures.length
      ? prisma.vacancyGroup.findMany({
          where: { signature: { in: signatures } },
          include: {
            vacancies: {
              select: {
                id: true,
                source: true,
                contactPhone: true,
                completeness: true,
                firstSeenAt: true,
                sourcePostExternalId: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    phones.length
      ? prisma.vacancy.findMany({
          where: {
            contactPhone: { in: vacancyBound.map((item) => item.record.contactPhone).filter((item): item is string => Boolean(item)) },
            citySlug: { in: citySlugs.length ? citySlugs : [defaultCitySlug] },
          },
          select: existingSelect(),
          take: 400,
        })
      : Promise.resolve([] as ExistingVacancy[]),
    vacancyBound.length
      ? prisma.vacancy.findMany({
          where: {
            slug: {
              in: vacancyBound.map((item) =>
                vacancySlug({
                  professionSlug: item.record.professionSlug ?? null,
                  title: item.record.title,
                  citySlug: item.record.citySlug || defaultCitySlug,
                  source: item.record.source,
                  externalId: item.record.externalId,
                }),
              ),
            },
          },
          select: { slug: true },
        })
      : Promise.resolve([] as { slug: string }[]),
  ]);

  const pairMap = new Map<string, ExistingVacancy>();
  for (const row of existingByPair) {
    pairMap.set(pairKey(row.source, row.externalId), row);
  }
  const hashMap = new Map<string, ExistingVacancy[]>();
  for (const row of [...existingByHash, ...existingByPair]) {
    const list = hashMap.get(row.contentHash) ?? [];
    list.push(row);
    hashMap.set(row.contentHash, list);
  }
  const verdictMap = new Map(verdicts.map((row) => [row.contact, row.verdict]));
  const groupMap = new Map<string, GroupRow>();
  for (const row of groups) {
    groupMap.set(row.signature, {
      id: row.id,
      signature: row.signature,
      primaryVacancyId: row.primaryVacancyId,
      postingsCount: row.postingsCount,
      sourcesCount: row.sourcesCount,
      distinctPhonesCount: row.distinctPhonesCount,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
        members: row.vacancies,
    });
  }
  const takenSlugs = new Set(slugRows.map((row) => row.slug));
  for (const row of existingByPair) {
    takenSlugs.add(row.slug);
  }

  const employerIds = await resolveEmployerMap(
    vacancyBound.flatMap((item) => {
      const city = decideCity(item.record.citySlug ?? undefined, item.record.cityName ?? undefined);
      if (!city.ok) {
        return [];
      }
      return [
        {
          inn: item.record.employerInn ?? null,
          name: item.record.employerName ?? null,
          citySlug: city.city.slug,
          sphere: item.record.sphere || "unknown",
        },
      ];
    }),
  );

  type CreatePlan = {
    index: number;
    record: ParserVacancyInput;
    data: Prisma.VacancyCreateManyInput;
    duplicateOfId: string | null;
    isDuplicate: boolean;
    status: ModerationStatus;
    contact: string | null;
    hard: boolean;
    citySlug: string;
  };
  type UpdatePlan = {
    id: string;
    index: number;
    record: ParserVacancyInput;
    data: Prisma.VacancyUpdateInput;
    duplicateOfId: string | null;
    isDuplicate: boolean;
    status: ModerationStatus;
    contact: string | null;
    hard: boolean;
    citySlug: string;
    existing: ExistingVacancy;
  };

  const creates: CreatePlan[] = [];
  const updates: UpdatePlan[] = [];
  const blockContacts = new Map<string, string>();

  for (const item of vacancyBound) {
    const record = item.record;
    const city = decideCity(record.citySlug ?? undefined, record.cityName ?? undefined);
    if (!city.ok) {
      continue;
    }
    const description = truncateDescription(record.description ?? record.unitText ?? record.rawText);
    const completeness = record.completeness ?? 0;
    const hash = isSha1(record.contentHash)
      ? record.contentHash
      : contentHash(record.rawText || description, record.contactPhone);
    const signature =
      record.signature?.trim() ||
      [record.professionSlug || "unknown", record.workFormat || "LOCAL", city.city.slug, "none", ""].join("|");
    const contact = contactKey(record.contactPhone, record.contactTelegram);
    const flags = record.trustFlags ?? [];
    const decision = decideModeration({
      trustScore: record.trustScore ?? 0,
      flags,
      hard: record.hard,
      parserStatus: record.moderationStatus ?? null,
      contactVerdict: contact ? (verdictMap.get(contact) ?? null) : null,
    });
    if (decision.status === ModerationStatus.PENDING) {
      pending += 1;
    }
    if (decision.status === ModerationStatus.BLOCKED) {
      blocked += 1;
      const hardId = flags.find((flag) => flag.hard || flag.id)?.id ?? "жёсткий флаг";
      bumpReason(hardId);
      if (contact) {
        blockContacts.set(contact, blockReasonForFlags(flags.map((flag) => flag.id)));
      }
    }

    const qualityScore = qualityScoreFrom({
      completeness,
      hasSalary: record.salaryFrom != null || record.salaryTo != null,
      hasContact: Boolean(record.contactPhone || record.contactTelegram || record.contactEmail),
      descriptionLength: description.length,
    });
    const postId = sourcePostId(record);
    const existingExact = pairMap.get(pairKey(asSource(record.source), record.externalId));
    const workFormat = (record.workFormat ?? "LOCAL") as WorkFormat;

    let duplicateOfId: string | null = null;
    let isDuplicate = false;
    if (!existingExact) {
      const hashHits = (hashMap.get(hash) ?? []).filter(
        (row) => !samePostUnits(row.sourcePostExternalId, postId),
      );
      if (hashHits[0]) {
        duplicateOfId = hashHits[0].id;
        isDuplicate = true;
      } else if (record.contactPhone) {
        const title = record.titleNormalized || record.title;
        const hit = similarByPhone.find(
          (row) =>
            row.contactPhone === record.contactPhone &&
            row.citySlug === city.city.slug &&
            row.workFormat === workFormat &&
            !samePostUnits(row.sourcePostExternalId, postId) &&
            titlesSimilar(row.titleNormalized || row.title, title),
        );
        if (hit) {
          duplicateOfId = hit.id;
          isDuplicate = true;
        }
      }
    }

    const now = new Date();
    const publishedAt = record.publishedAt ? new Date(record.publishedAt) : now;
    const splitIndex = record.splitIndex ?? 0;
    const ocrVersion = asVersionString(record.ocrVersion);
    const splitterVersion = asVersionString(record.splitterVersion);
    const hours =
      record.hoursPerDay == null || Number.isNaN(record.hoursPerDay) ? null : Math.round(record.hoursPerDay);
    const inn = cleanInn(record.employerInn);
    const employerKey = employerLookupKey(inn, record.employerName ?? null, city.city.slug);
    const employerId = employerKey ? (employerIds.get(employerKey) ?? null) : null;
    const salaryIsGross =
      record.salaryIsGross ?? (asSource(record.source) === Source.TRUDVSEM ? true : null);

    if (existingExact) {
      const data: Prisma.VacancyUpdateInput = {
        title: record.title,
        titleOriginal: record.titleOriginal ?? undefined,
        titleNormalized: (record.titleNormalized || record.title).toLocaleLowerCase("ru-RU"),
        description,
        descriptionSections: record.descriptionSections ? jsonValue(record.descriptionSections) : undefined,
        summaryLine: record.summaryLine ?? undefined,
        completeness,
        normalizerVersion: record.normalizerVersion || "1",
        needsAiReview: record.needsAiReview ?? undefined,
        needsHumanReview: record.needsHumanReview || decision.status === ModerationStatus.PENDING || isDuplicate,
        salaryFrom: record.salaryFrom ?? null,
        salaryTo: record.salaryTo ?? null,
        salaryText: record.salaryText ?? null,
        salaryCurrency: record.salaryCurrency || "RUB",
        salaryPeriod: (record.salaryPeriod ?? "MONTH") as SalaryPeriod,
        citySlug: city.city.slug,
        districtSlug: record.districtSlug ?? null,
        address: record.address ?? null,
        workFormat,
        workLocationText: record.workLocationText ?? null,
        workCitySlug: record.workCitySlug ?? null,
        rotationPattern: record.rotationPattern ?? null,
        vahtaDays: record.vahtaDays ?? null,
        housingProvided: record.housingProvided ?? false,
        mealsProvided: record.mealsProvided ?? false,
        travelPaid: record.travelPaid ?? false,
        advancePayment: record.advancePayment ?? false,
        employerKind: (record.employerKind ?? "UNKNOWN") as EmployerKind,
        sphere: record.sphere || "unknown",
        professionSlug: record.professionSlug ?? null,
        schedule: workFormat === WorkFormat.VAHTA ? null : record.schedule ?? null,
        hoursPerDay: hours,
        experience: (record.experience ?? null) as Experience | null,
        employmentType: (record.employmentType ?? null) as EmploymentType | null,
        contactPhone: record.contactPhone ?? null,
        contactTelegram: record.contactTelegram ?? null,
        contactEmail: record.contactEmail ?? null,
        sourceName: record.sourceName ?? undefined,
        sourceUrl: record.sourceUrl ?? undefined,
        salaryIsGross,
        employerInn: inn,
        contentHash: hash,
        signature,
        qualityScore,
        trustScore: record.trustScore ?? 0,
        trustFlags: jsonValue(flags),
        splitIndex,
        imageUrls: record.imageUrls ? jsonValue(record.imageUrls) : undefined,
        lastSeenAt: now,
        splitterVersion: splitterVersion ?? undefined,
      };
      if (shouldUpdateOcr(existingExact, record.ocrText ?? null, ocrVersion)) {
        data.ocrText = record.ocrText;
        data.ocrVersion = ocrVersion;
      }
      if (employerId) {
        data.employer = { connect: { id: employerId } };
      }
      if (existingExact.archivedAt) {
        data.archivedAt = null;
        if (
          existingExact.moderationStatus === ModerationStatus.APPROVED ||
          existingExact.moderationStatus === ModerationStatus.AUTO_OK
        ) {
          data.isActive = true;
        }
      }
      if (
        existingExact.moderationStatus !== ModerationStatus.APPROVED &&
        existingExact.moderationStatus !== ModerationStatus.REJECTED
      ) {
        data.moderationStatus = decision.status;
        data.isActive = decision.status !== ModerationStatus.BLOCKED;
      }
      if (duplicateOfId && !existingExact.id) {
        data.duplicateOf = { connect: { id: duplicateOfId } };
      }
      updates.push({
        id: existingExact.id,
        index: item.index,
        record,
        data,
        duplicateOfId,
        isDuplicate,
        status: decision.status,
        contact,
        hard: decision.hard,
        citySlug: city.city.slug,
        existing: existingExact,
      });
      updated += 1;
      if (isDuplicate) {
        duplicates += 1;
      }
      continue;
    }

    const slug = uniqueSlug(
      vacancySlug({
        professionSlug: record.professionSlug ?? null,
        title: record.title,
        citySlug: city.city.slug,
        source: record.source,
        externalId: record.externalId,
      }),
      takenSlugs,
    );

    const createData: Prisma.VacancyCreateManyInput = {
      slug,
      title: record.title,
      titleOriginal: record.titleOriginal ?? null,
      titleNormalized: (record.titleNormalized || record.title).toLocaleLowerCase("ru-RU"),
      rawText: record.rawText,
      ocrText: record.ocrText ?? null,
      imageUrls: record.imageUrls ? jsonValue(record.imageUrls) : undefined,
      splitIndex,
      sourcePostExternalId: postId,
      ocrVersion,
      splitterVersion,
      description,
      descriptionSections: record.descriptionSections ? jsonValue(record.descriptionSections) : undefined,
      summaryLine: record.summaryLine ?? null,
      completeness,
      normalizerVersion: record.normalizerVersion || "1",
      needsAiReview: record.needsAiReview ?? false,
      needsHumanReview: Boolean(record.needsHumanReview) || decision.status === ModerationStatus.PENDING || isDuplicate,
      salaryFrom: record.salaryFrom ?? null,
      salaryTo: record.salaryTo ?? null,
      salaryText: record.salaryText ?? null,
      salaryCurrency: record.salaryCurrency || "RUB",
      salaryPeriod: (record.salaryPeriod ?? "MONTH") as SalaryPeriod,
      citySlug: city.city.slug,
      districtSlug: record.districtSlug ?? null,
      address: record.address ?? null,
      workFormat,
      workLocationText: record.workLocationText ?? null,
      workCitySlug: record.workCitySlug ?? null,
      rotationPattern: record.rotationPattern ?? null,
      vahtaDays: record.vahtaDays ?? null,
      housingProvided: record.housingProvided ?? false,
      mealsProvided: record.mealsProvided ?? false,
      travelPaid: record.travelPaid ?? false,
      advancePayment: record.advancePayment ?? false,
      employerKind: (record.employerKind ?? "UNKNOWN") as EmployerKind,
      sphere: record.sphere || "unknown",
      professionSlug: record.professionSlug ?? null,
      schedule: workFormat === WorkFormat.VAHTA ? null : record.schedule ?? null,
      hoursPerDay: hours,
      experience: (record.experience ?? null) as Experience | null,
      employmentType: (record.employmentType ?? null) as EmploymentType | null,
      contactPhone: record.contactPhone ?? null,
      contactTelegram: record.contactTelegram ?? null,
      contactEmail: record.contactEmail ?? null,
      source: asSource(record.source),
      sourceName: record.sourceName ?? null,
      sourceUrl: record.sourceUrl ?? null,
      salaryIsGross,
      employerInn: inn,
      employerId,
      externalId: record.externalId,
      contentHash: hash,
      duplicateOfId,
      signature,
      qualityScore,
      trustScore: record.trustScore ?? 0,
      trustFlags: jsonValue(flags),
      moderationStatus: decision.status,
      isActive: decision.status !== ModerationStatus.BLOCKED,
      publishedAt,
    };

    creates.push({
      index: item.index,
      record,
      data: createData,
      duplicateOfId,
      isDuplicate,
      status: decision.status,
      contact,
      hard: decision.hard,
      citySlug: city.city.slug,
    });
    added += 1;
    if (isDuplicate) {
      duplicates += 1;
    }
  }

  await mapInChunks(updates, 20, (item) => prisma.vacancy.update({ where: { id: item.id }, data: item.data }));

  if (creates.length) {
    await prisma.vacancy.createMany({ data: creates.map((item) => item.data) });
  }
  const createdRows =
    creates.length === 0
      ? []
      : await prisma.vacancy.findMany({
          where: {
            source: { in: [...new Set(creates.map((item) => asSource(item.record.source)))] },
            externalId: { in: creates.map((item) => item.record.externalId) },
          },
          select: {
            id: true,
            source: true,
            externalId: true,
            sourcePostExternalId: true,
            signature: true,
            completeness: true,
            firstSeenAt: true,
            contactPhone: true,
            groupId: true,
          },
        });
  const createdIdByPair = new Map(createdRows.map((row) => [pairKey(row.source, row.externalId), row]));

  const attach: { vacancyId: string; signature: string; source: Source; phone: string | null; completeness: number; firstSeenAt: Date; postId: string }[] = [];
  for (const item of creates) {
    const row = createdIdByPair.get(pairKey(asSource(item.record.source), item.record.externalId));
    if (row) {
      attach.push({
        vacancyId: row.id,
        signature: item.data.signature,
        source: row.source,
        phone: row.contactPhone,
        completeness: row.completeness,
        firstSeenAt: row.firstSeenAt,
        postId: row.sourcePostExternalId,
      });
    }
  }
  for (const item of updates) {
    attach.push({
      vacancyId: item.id,
        signature: item.record.signature || item.existing.signature,
      source: item.existing.source,
      phone: item.record.contactPhone ?? item.existing.contactPhone,
      completeness: item.record.completeness ?? item.existing.completeness,
      firstSeenAt: item.existing.firstSeenAt,
      postId: item.existing.sourcePostExternalId,
    });
  }

  await applySignatureGroups(attach, groupMap);

  await mapInChunks([...blockContacts.entries()], 10, ([contact, reason]) =>
    prisma.contactVerdict.upsert({
      where: { contact },
      create: {
        contact,
        verdict: ContactVerdictKind.BLOCKED,
        reason,
        vacanciesCount: 1,
      },
      update: {
        verdict: ContactVerdictKind.BLOCKED,
        reason,
        vacanciesCount: { increment: 1 },
      },
    }),
  );

  const maybeByPost = new Map<string, { index: number; record: ParserVacancyInput }>();
  for (const item of maybeItems) {
    const key = `${item.record.source}::${sourcePostId(item.record)}`;
    if (!maybeByPost.has(key)) {
      maybeByPost.set(key, item);
    }
  }
  const maybeRows = [...maybeByPost.values()];
  await mapInChunks(maybeRows, 10, async (item) => {
    const externalId = sourcePostId(item.record);
    const city = decideCity(item.record.citySlug ?? undefined, item.record.cityName ?? undefined);
    await prisma.parsedPost.upsert({
      where: { source_externalId: { source: asSource(item.record.source), externalId } },
      create: {
        source: asSource(item.record.source),
        externalId,
        rawText: item.record.rawText,
        sourceUrl: item.record.sourceUrl ?? null,
        detectedCity: city.ok ? city.city.slug : item.record.citySlug ?? null,
        filterScore: item.record.filterScore ?? 45,
        filterReasons: jsonValue(item.record.reasons ?? item.record.filterReasons ?? ["maybe"]),
        status: "PENDING",
      },
      update: {
        rawText: item.record.rawText,
        sourceUrl: item.record.sourceUrl ?? null,
        detectedCity: city.ok ? city.city.slug : item.record.citySlug ?? null,
        filterScore: item.record.filterScore ?? 45,
        filterReasons: jsonValue(item.record.reasons ?? item.record.filterReasons ?? ["maybe"]),
        status: "PENDING",
      },
    });
  });
  maybeCount += maybeRows.length;
  pending += maybeRows.length;
  if (maybeRows.length) {
    bumpReason("возможно вакансия", maybeRows.length);
  }

  const run = await prisma.parserRun.create({
    data: {
      parser: input.parser.slice(0, 80),
      startedAt: input.startedAt,
      finishedAt: new Date(),
      postsSeen: input.items.length,
      postsAccepted: added + updated,
      postsRejected: skippedCity + discardedSvo + maybeCount + errorItems.length,
      postsPending: pending,
      postsBlocked: blocked,
      rejectReasons: Object.keys(rejectReasons).length ? jsonValue(rejectReasons) : undefined,
      vacanciesCreated: added,
      vacanciesUpdated: updated,
      errorsCount: errorItems.length,
    },
  });

  clearMemoryCache();

  return {
    added,
    updated,
    duplicates,
    pending,
    blocked,
    skippedCity,
    discardedSvo,
    maybe: maybeCount,
    errors: errorItems.length,
    errorItems,
    skippedCityItems,
    runId: run.id,
    elapsedMs: Date.now() - started,
  };
}

function existingSelect() {
  return {
    id: true,
    source: true,
    externalId: true,
    sourcePostExternalId: true,
    slug: true,
    title: true,
    titleNormalized: true,
    citySlug: true,
    contactPhone: true,
    contentHash: true,
    signature: true,
    completeness: true,
    firstSeenAt: true,
    groupId: true,
    ocrText: true,
    ocrVersion: true,
    splitIndex: true,
    moderationStatus: true,
    workFormat: true,
    archivedAt: true,
    isActive: true,
  } satisfies Prisma.VacancySelect;
}

async function applySignatureGroups(
  rows: {
    vacancyId: string;
    signature: string;
    source: Source;
    phone: string | null;
    completeness: number;
    firstSeenAt: Date;
    postId: string;
  }[],
  existing: Map<string, GroupRow>,
): Promise<void> {
  if (existing.size === 0 || rows.length === 0) {
    return;
  }
  const bySignature = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.signature) {
      continue;
    }
    const list = bySignature.get(row.signature) ?? [];
    list.push(row);
    bySignature.set(row.signature, list);
  }

  for (const [signature, members] of bySignature) {
    const group = existing.get(signature);
    const known = new Map((group?.members ?? []).map((item) => [item.id, item]));
    for (const member of members) {
      const clash = [...known.values()].some(
        (item) => item.sourcePostExternalId === member.postId && item.id !== member.vacancyId,
      );
      if (clash) {
        continue;
      }
      known.set(member.vacancyId, {
        id: member.vacancyId,
        source: member.source,
        contactPhone: member.phone,
        completeness: member.completeness,
        firstSeenAt: member.firstSeenAt,
        sourcePostExternalId: member.postId,
      });
    }
    const all = [...known.values()];
    if (all.length === 0) {
      continue;
    }
    const sources = new Set(all.map((item) => item.source));
    const phones = new Set(all.map((item) => item.contactPhone).filter(Boolean));
    const primary = [...all].sort((left, right) => {
      if (right.completeness !== left.completeness) {
        return right.completeness - left.completeness;
      }
      return left.firstSeenAt.getTime() - right.firstSeenAt.getTime();
    })[0]!;
    const now = new Date();

    if (!group?.id) {
      continue;
    }

    await prisma.vacancyGroup.update({
      where: { id: group.id },
      data: {
        primaryVacancyId: primary.id,
        postingsCount: all.length,
        sourcesCount: sources.size,
        distinctPhonesCount: phones.size,
        lastSeenAt: now,
      },
    });
    group.primaryVacancyId = primary.id;
    group.members = all;

    await prisma.vacancy.updateMany({
      where: { id: { in: all.map((item) => item.id) } },
      data: { groupId: group.id },
    });
  }
}

async function mapInChunks<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<unknown>,
): Promise<void> {
  for (let offset = 0; offset < items.length; offset += size) {
    const slice = items.slice(offset, offset + size);
    await Promise.all(slice.map((item) => fn(item)));
  }
}

export async function deactivateStaleVacancies(days = 30): Promise<{ deactivated: number; days: number }> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const result = await prisma.vacancy.updateMany({
    where: {
      isActive: true,
      lastSeenAt: { lt: cutoff },
      source: { not: Source.TRUDVSEM },
    },
    data: { isActive: false },
  });
  clearMemoryCache();
  return { deactivated: result.count, days };
}
