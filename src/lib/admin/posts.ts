import { ModerationStatus, ParsedPostStatus, Prisma, type Source } from "@prisma/client";
import { prisma } from "@/lib/adapters/db";
import { addProfession, addStopWord } from "@/lib/admin/dictionaries";
import { extractPhone, extractTelegram, firstTitle } from "@/lib/admin/extract";
import { parseStringList } from "@/lib/admin/flags";
import { REVIEWED_BY } from "@/lib/admin/constants";
import { isActiveCity, getDefaultCity } from "@/lib/geo";
import { contentHash } from "@/lib/parser/dedupe";
import { uniqueSlug, vacancySlug } from "@/lib/parser/slug";
import { truncateDescription } from "@/lib/parser/schema";
import { qualityScoreFrom } from "@/lib/parser/quality";
import { touchSite } from "@/lib/admin/decisions";

export type AdminParsedPost = {
  id: string;
  source: Source;
  externalId: string;
  rawText: string;
  sourceUrl: string | null;
  detectedCity: string | null;
  filterScore: number;
  reasons: string[];
  createdAt: Date;
};

export async function listPendingPosts(): Promise<AdminParsedPost[]> {
  const rows = await prisma.parsedPost.findMany({
    where: { status: ParsedPostStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  return rows.map((row) => ({
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    rawText: row.rawText,
    sourceUrl: row.sourceUrl,
    detectedCity: row.detectedCity,
    filterScore: row.filterScore,
    reasons: parseStringList(row.filterReasons),
    createdAt: row.createdAt,
  }));
}

export async function rejectPost(
  id: string,
  stopWord?: string,
): Promise<{ ok: true; dictWarning?: string } | { ok: false; error: string }> {
  const row = await prisma.parsedPost.findUnique({ where: { id } });
  if (!row) {
    return { ok: false, error: "Пост не найден." };
  }
  await prisma.parsedPost.update({
    where: { id },
    data: { status: ParsedPostStatus.REJECTED },
  });
  let dictWarning: string | undefined;
  if (stopWord?.trim()) {
    const written = await addStopWord(stopWord);
    if (!written.ok) {
      dictWarning = written.error;
    }
  }
  return { ok: true, dictWarning };
}

export async function approvePostAsVacancy(input: {
  id: string;
  addProfessionName?: string;
  sphere?: string;
}): Promise<{ ok: true; vacancyId: string; slug: string; citySlug: string } | { ok: false; error: string }> {
  const row = await prisma.parsedPost.findUnique({ where: { id: input.id } });
  if (!row) {
    return { ok: false, error: "Пост не найден." };
  }
  const citySlug = row.detectedCity && isActiveCity(row.detectedCity) ? row.detectedCity : getDefaultCity().slug;
  const title = firstTitle(row.rawText);
  const phone = extractPhone(row.rawText);
  const telegram = extractTelegram(row.rawText);
  const description = truncateDescription(row.rawText);
  let professionSlug: string | null = null;
  if (input.addProfessionName?.trim() && input.sphere) {
    const added = await addProfession({ name: input.addProfessionName, sphere: input.sphere });
    if (added.ok && added.slug) {
      professionSlug = added.slug;
    }
  }

  const existing = await prisma.vacancy.findUnique({
    where: { source_externalId: { source: row.source, externalId: row.externalId } },
  });
  if (existing) {
    await prisma.vacancy.update({
      where: { id: existing.id },
      data: {
        moderationStatus: ModerationStatus.APPROVED,
        isActive: true,
        needsHumanReview: true,
        reviewedAt: new Date(),
        reviewedBy: REVIEWED_BY,
      },
    });
    await prisma.parsedPost.update({
      where: { id: row.id },
      data: { status: ParsedPostStatus.APPROVED },
    });
    await touchSite(existing.citySlug, existing.slug);
    return { ok: true, vacancyId: existing.id, slug: existing.slug, citySlug: existing.citySlug };
  }

  const base = vacancySlug({
    professionSlug,
    title,
    citySlug,
    source: row.source,
    externalId: row.externalId,
  });
  const takenRows = await prisma.vacancy.findMany({
    where: { slug: { startsWith: base.slice(0, 24) } },
    select: { slug: true },
    take: 50,
  });
  const slug = uniqueSlug(base, new Set(takenRows.map((item) => item.slug)));

  try {
    const created = await prisma.vacancy.create({
      data: {
        slug,
        title,
        titleOriginal: title,
        titleNormalized: title.toLocaleLowerCase("ru-RU"),
        rawText: row.rawText,
        sourcePostExternalId: row.externalId,
        description,
        summaryLine: title.slice(0, 200),
        completeness: 20,
        normalizerVersion: "1",
        citySlug,
        sphere: input.sphere || "unknown",
        professionSlug,
        contactPhone: phone,
        contactTelegram: telegram,
        source: row.source,
        sourceUrl: row.sourceUrl,
        externalId: row.externalId,
        contentHash: contentHash(row.rawText, phone),
        signature: [professionSlug || "unknown", "LOCAL", citySlug, phone || "none", ""].join("|"),
        qualityScore: qualityScoreFrom({
          completeness: 20,
          hasSalary: false,
          hasContact: Boolean(phone || telegram),
          descriptionLength: description.length,
        }),
        trustScore: 70,
        trustFlags: [],
        moderationStatus: ModerationStatus.APPROVED,
        isActive: true,
        publishedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: REVIEWED_BY,
        needsHumanReview: true,
      },
    });
    await prisma.parsedPost.update({
      where: { id: row.id },
      data: { status: ParsedPostStatus.APPROVED },
    });
    await touchSite(citySlug, created.slug);
    return { ok: true, vacancyId: created.id, slug: created.slug, citySlug };
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
      return { ok: false, error: "Такая вакансия уже есть в базе." };
    }
    throw cause;
  }
}
