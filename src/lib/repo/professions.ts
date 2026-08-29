import { wrap } from "@/lib/adapters/cache";
import { prisma } from "@/lib/adapters/db";
import { getProfession } from "@/lib/professions";
import { repoError } from "@/lib/repo/errors";
import { countVacanciesByProfession } from "@/lib/repo/vacancies";

const CATALOG_TTL_SECONDS = 10 * 60;
const MAX_PROFESSIONS = 200;

export async function listProfessions(sphere?: string) {
  const cacheKey = sphere ? `catalog:professions:${sphere}` : "catalog:professions";

  try {
    return await wrap(cacheKey, CATALOG_TTL_SECONDS, () =>
      prisma.profession.findMany({
        where: sphere ? { sphere } : undefined,
        select: {
          slug: true,
          name: true,
          sphere: true,
          synonyms: true,
        },
        orderBy: { name: "asc" },
        take: MAX_PROFESSIONS,
      }),
    );
  } catch (cause) {
    throw repoError("загрузить профессии", cause);
  }
}

export type PopularProfession = {
  slug: string;
  name: string;
  count: number;
};

const POPULAR_TTL_SECONDS = 10 * 60;
const MAX_POPULAR = 8;

/** Теги на главной: имена из professions.json, порядок — по числу вакансий в городе. */
export async function getPopularProfessions(
  citySlug: string,
  limit = MAX_POPULAR,
): Promise<PopularProfession[]> {
  const take = Math.min(Math.max(1, limit), MAX_POPULAR);
  const cacheKey = `home:popular-professions:${citySlug}:${take}`;

  try {
    return await wrap(cacheKey, POPULAR_TTL_SECONDS, async () => {
      const counts = await countVacanciesByProfession(citySlug, take);
      const tags: PopularProfession[] = [];
      for (const row of counts) {
        const profession = getProfession(row.professionSlug);
        if (!profession) {
          continue;
        }
        tags.push({ slug: profession.slug, name: profession.name, count: row.count });
      }
      return tags;
    });
  } catch (cause) {
    throw repoError("подобрать популярные профессии", cause);
  }
}

export async function getProfessionBySlug(slug: string) {
  try {
    return await prisma.profession.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        sphere: true,
        synonyms: true,
      },
    });
  } catch (cause) {
    throw repoError("открыть профессию", cause);
  }
}
