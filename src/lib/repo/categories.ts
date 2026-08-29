import { wrap } from "@/lib/adapters/cache";
import { prisma } from "@/lib/adapters/db";
import { repoError } from "@/lib/repo/errors";

const CATALOG_TTL_SECONDS = 10 * 60;
const MAX_CATEGORIES = 50;

export async function listCategories() {
  try {
    return await wrap("catalog:categories", CATALOG_TTL_SECONDS, () =>
      prisma.category.findMany({
        select: {
          slug: true,
          name: true,
          icon: true,
          order: true,
        },
        orderBy: { order: "asc" },
        take: MAX_CATEGORIES,
      }),
    );
  } catch (cause) {
    throw repoError("загрузить сферы", cause);
  }
}

export async function getCategoryBySlug(slug: string) {
  try {
    return await prisma.category.findUnique({
      where: { slug },
      select: {
        slug: true,
        name: true,
        icon: true,
        order: true,
      },
    });
  } catch (cause) {
    throw repoError("открыть сферу", cause);
  }
}
