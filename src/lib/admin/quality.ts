import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { LOW_COMPLETENESS, REVIEWED_BY } from "@/lib/admin/constants";
import { writeLearnedSamples, type LearnedPost } from "@/lib/admin/dictionaries";
import { parseSections, sectionsFromForm, sectionsPayload } from "@/lib/admin/sections";
import { truncateDescription } from "@/lib/parser/schema";
import { touchSite } from "@/lib/admin/decisions";

export type QualityMetrics = {
  avgCompleteness: number;
  withSectionsShare: number;
  withSalaryShare: number;
  editsThisWeek: number;
  topCorrectedField: { field: string; count: number } | null;
  sampleCount: number;
};

export type QualityItem = {
  id: string;
  slug: string;
  title: string;
  citySlug: string;
  rawText: string;
  description: string;
  summaryLine: string | null;
  completeness: number;
  viewsCount: number;
  needsHumanReview: boolean;
  normalizerVersion: string;
  sections: ReturnType<typeof parseSections>;
  salaryFrom: number | null;
  salaryTo: number | null;
  professionSlug: string | null;
  schedule: string | null;
  districtSlug: string | null;
};

function qualityWhere(): Prisma.VacancyWhereInput {
  return {
    OR: [{ needsHumanReview: true }, { completeness: { lt: LOW_COMPLETENESS } }],
    moderationStatus: { in: ["AUTO_OK", "APPROVED"] },
  };
}

export async function qualityMetrics(): Promise<QualityMetrics> {
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [agg, withSections, withSalary, total, editsThisWeek, samples] = await Promise.all([
    prisma.vacancy.aggregate({
      where: { moderationStatus: { in: ["AUTO_OK", "APPROVED"] } },
      _avg: { completeness: true },
      _count: true,
    }),
    prisma.vacancy.count({
      where: { moderationStatus: { in: ["AUTO_OK", "APPROVED"] }, NOT: { descriptionSections: { equals: Prisma.DbNull } } },
    }),
    prisma.vacancy.count({
      where: {
        moderationStatus: { in: ["AUTO_OK", "APPROVED"] },
        OR: [{ salaryFrom: { not: null } }, { salaryTo: { not: null } }],
      },
    }),
    prisma.vacancy.count({ where: { moderationStatus: { in: ["AUTO_OK", "APPROVED"] } } }),
    prisma.normalizationSample.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.normalizationSample.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: { expectedFields: true },
      take: 500,
    }),
  ]);
  const fieldCounts = new Map<string, number>();
  for (const row of samples) {
    const fields = row.expectedFields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      continue;
    }
    const corrected = (fields as { _corrected?: string[] })._corrected;
    if (Array.isArray(corrected)) {
      for (const key of corrected) {
        fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const top = [...fieldCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    avgCompleteness: Math.round(agg._avg.completeness ?? 0),
    withSectionsShare: total ? withSections / total : 0,
    withSalaryShare: total ? withSalary / total : 0,
    editsThisWeek,
    topCorrectedField: top ? { field: top[0], count: top[1] } : null,
    sampleCount: await prisma.normalizationSample.count(),
  };
}

export async function listQualityQueue(): Promise<QualityItem[]> {
  const rows = await prisma.vacancy.findMany({
    where: qualityWhere(),
    orderBy: [{ viewsCount: "desc" }, { completeness: "asc" }],
    take: 80,
    select: {
      id: true,
      slug: true,
      title: true,
      citySlug: true,
      rawText: true,
      description: true,
      summaryLine: true,
      completeness: true,
      viewsCount: true,
      needsHumanReview: true,
      normalizerVersion: true,
      descriptionSections: true,
      salaryFrom: true,
      salaryTo: true,
      professionSlug: true,
      schedule: true,
      districtSlug: true,
    },
  });
  return rows.map((row) => ({
    ...row,
    rawText: row.rawText ?? "",
    sections: parseSections(row.descriptionSections),
  }));
}

function correctedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) {
      changed.push(key);
    }
  }
  return changed;
}

export async function acceptQuality(
  id: string,
  form: FormData | null,
  mode: "accept" | "edit" | "reject",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await prisma.vacancy.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, error: "Вакансия не найдена." };
  }
  if (mode === "reject") {
    const original = truncateDescription(row.rawText || row.description);
    await prisma.vacancy.update({
      where: { id },
      data: {
        description: original,
        descriptionSections: Prisma.JsonNull,
        summaryLine: original.split("\n")[0]?.slice(0, 200) ?? row.title,
        needsHumanReview: false,
        reviewedAt: new Date(),
        reviewedBy: REVIEWED_BY,
      },
    });
    await touchSite(row.citySlug, row.slug);
    return { ok: true };
  }

  const sections = form ? sectionsFromForm(form) : parseSections(row.descriptionSections);
  const title = form ? String(form.get("title") ?? row.title).trim() || row.title : row.title;
  const description = form
    ? truncateDescription(String(form.get("description") ?? row.description))
    : row.description;
  const summaryLine = form ? String(form.get("summaryLine") ?? row.summaryLine ?? "").trim() || null : row.summaryLine;
  const before = {
    title: row.title,
    description: row.description,
    summaryLine: row.summaryLine,
    sections: parseSections(row.descriptionSections),
  };
  const after = { title, description, summaryLine, sections };
  await prisma.vacancy.update({
    where: { id },
    data: {
      title,
      titleNormalized: title.toLocaleLowerCase("ru-RU"),
      description,
      descriptionSections: sectionsPayload(sections) ?? Prisma.JsonNull,
      summaryLine,
      needsHumanReview: false,
      reviewedAt: new Date(),
      reviewedBy: REVIEWED_BY,
    },
  });

  if (mode === "edit") {
    const changed = correctedKeys(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>);
    await prisma.normalizationSample.create({
      data: {
        sourceText: row.rawText || row.description,
        expectedTitle: title,
        expectedSections: sectionsPayload(sections) ?? Prisma.JsonNull,
        expectedFields: {
          title,
          description,
          summaryLine,
          professionSlug: row.professionSlug,
          schedule: row.schedule,
          districtSlug: row.districtSlug,
          salaryFrom: row.salaryFrom,
          salaryTo: row.salaryTo,
          _corrected: changed.length ? changed : ["title"],
        } as Prisma.InputJsonValue,
        correctedBy: REVIEWED_BY,
        normalizerVersion: row.normalizerVersion,
      },
    });
  }
  await touchSite(row.citySlug, row.slug);
  return { ok: true };
}

export async function exportLearnedSamples(): Promise<{ ok: true; count: number; path: string } | { ok: false; error: string }> {
  const rows = await prisma.normalizationSample.findMany({ orderBy: { createdAt: "asc" }, take: 2000 });
  const posts: LearnedPost[] = rows.map((row) => {
    const sections = parseSections(row.expectedSections);
    return {
      id: `learn-${row.id.slice(-8)}`,
      note: "правка из админки",
      text: row.sourceText,
      expected: {
        title: row.expectedTitle,
        recordCount: 1,
        ...(row.expectedTitle ? { summaryContains: [row.expectedTitle] } : {}),
        ...(sections.tasks.length ? { hasTasks: true } : {}),
        ...(sections.requirements.length ? { hasRequirements: true } : {}),
        ...(sections.conditions.length ? { hasConditions: true } : {}),
      },
    };
  });
  const written = await writeLearnedSamples(posts);
  if (!written.ok) {
    return written;
  }
  return { ok: true, count: posts.length, path: written.path };
}
