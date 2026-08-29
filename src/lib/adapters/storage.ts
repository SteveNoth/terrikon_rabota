/**
 * Переходник к файлам (Закон 6, Закон 10).
 *
 * По умолчанию STORAGE_DRIVER=external: мы не кладём картинки в свою базу
 * и не поднимаем своё хранилище. Логотип — либо внешняя ссылка, либо буквы.
 * Когда появится S3, меняется только эта переменная, не компоненты.
 */

export interface StorageAdapter {
  /** Вернуть публичный адрес. Для external «ключ» уже и есть ссылка. */
  publicUrl(key: string | null | undefined): string | null;
}

class ExternalStorage implements StorageAdapter {
  publicUrl(key: string | null | undefined): string | null {
    if (!key) {
      return null;
    }
    const trimmed = key.trim();
    if (trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
      return trimmed;
    }
    return null;
  }
}

class S3Storage implements StorageAdapter {
  publicUrl(key: string | null | undefined): string | null {
    if (!key) {
      return null;
    }
    const base = process.env.S3_PUBLIC_BASE_URL;
    if (!base) {
      return new ExternalStorage().publicUrl(key);
    }
    return `${base.replace(/\/$/, "")}/${key.replace(/^\//, "")}`;
  }
}

function createStorage(): StorageAdapter {
  const driver = (process.env.STORAGE_DRIVER ?? "external").toLowerCase();
  if (driver === "s3") {
    return new S3Storage();
  }
  return new ExternalStorage();
}

export const storage = createStorage();
