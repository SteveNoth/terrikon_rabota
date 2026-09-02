import { revalidatePath } from "next/cache";
import { clearMemoryCache } from "@/lib/adapters/cache";

/**
 * Сброс выдачи и админки после решения. Вне запроса Next кэш страниц не трогаем.
 */
export async function touchSite(citySlug: string, slug?: string): Promise<void> {
  clearMemoryCache();
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
