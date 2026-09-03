import { revalidatePath } from "next/cache";
import { clearMemoryCache } from "@/lib/adapters/cache";
import { recomputeVacancyCounts } from "@/lib/hygiene/counters";

async function revalidateListing(citySlug: string, slug?: string): Promise<void> {
  try {
    revalidatePath(`/${citySlug}`);
    revalidatePath(`/${citySlug}/jobs`);
    revalidatePath(`/${citySlug}/vahta`);
    if (slug) {
      revalidatePath(`/${citySlug}/job/${slug}`);
    }
    revalidatePath("/admin");
    revalidatePath("/admin/queue");
    revalidatePath("/admin/employers");
    revalidatePath("/admin/employers/queue");
    revalidatePath("/admin/users");
    revalidatePath("/admin/blocked");
    revalidatePath("/admin/reports");
  } catch {
    // Вне запроса Next (скрипты проверки) кэш страниц не сбросить — решение в базе уже есть.
  }
}

/**
 * Сброс выдачи и админки после решения. Счётчики сфер пересчитываем сразу:
 * иначе главная час держит нули из SphereStat.
 */
export async function touchSite(citySlug: string, slug?: string): Promise<void> {
  try {
    await recomputeVacancyCounts();
  } catch {
    clearMemoryCache();
  }
  await revalidateListing(citySlug, slug);
}

/** После пачки парсера: счётчики + главные затронутых городов. */
export async function touchCities(citySlugs: string[]): Promise<void> {
  try {
    await recomputeVacancyCounts();
  } catch {
    clearMemoryCache();
  }
  const unique = [...new Set(citySlugs.filter(Boolean))];
  if (unique.length === 0) {
    await revalidateListing("gorlovka");
    return;
  }
  for (const citySlug of unique) {
    await revalidateListing(citySlug);
  }
}
