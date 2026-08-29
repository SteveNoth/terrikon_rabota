import { wrap } from "@/lib/adapters/cache";
import { prisma } from "@/lib/adapters/db";
import { repoError } from "@/lib/repo/errors";

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
