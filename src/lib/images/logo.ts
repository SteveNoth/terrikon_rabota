import { storage } from "@/lib/adapters/storage";
import { isAllowedRemoteImageUrl } from "@/lib/images/remote";

/**
 * Ссылка, которую можно отдать в SmartImage.
 * Нет URL, не https, не из списка CDN — null, запроса не будет (Закон 4).
 */
export function displayableLogoUrl(raw: string | null | undefined): string | null {
  const url = storage.publicUrl(raw);
  if (!url || !isAllowedRemoteImageUrl(url)) {
    return null;
  }
  return url;
}