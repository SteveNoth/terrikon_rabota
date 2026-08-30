/**
 * Переходник кэша (Закон 6).
 *
 * Сейчас — память процесса: быстро и бесплатно. Список вакансий сюда не кладём:
 * объявления должны устаревать сразу, а справочники и счётчики меняются редко.
 *
 * CACHE_DRIVER=redis — задел на потом. Клиент Redis не ставим, пока нет лимита
 * по памяти: лишняя библиотека сразу бьёт по бюджету килобайт.
 */

export interface CacheAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T> | T): Promise<T>;
}

type Entry = {
  value: unknown;
  expiresAt: number;
};

const globalForCache = globalThis as unknown as {
  memoryCacheStore?: Map<string, Entry>;
};

function store(): Map<string, Entry> {
  if (!globalForCache.memoryCacheStore) {
    globalForCache.memoryCacheStore = new Map();
  }
  return globalForCache.memoryCacheStore;
}

class MemoryCache implements CacheAdapter {
  async get<T>(key: string): Promise<T | undefined> {
    const entry = store().get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      store().delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const ttlMs = Math.max(1, ttlSeconds) * 1000;
    store().set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async wrap<T>(key: string, ttlSeconds: number, fn: () => Promise<T> | T): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) {
      return hit;
    }
    const value = await fn();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

const memoryCache = new MemoryCache();

function createCache(): CacheAdapter {
  const driver = (process.env.CACHE_DRIVER ?? "memory").toLowerCase();
  if (driver === "redis") {
    console.warn(
      "CACHE_DRIVER=redis: клиент Redis ещё не подключён. Работаем через память процесса.",
    );
  }
  return memoryCache;
}

const adapter = createCache();

export async function get<T>(key: string): Promise<T | undefined> {
  return adapter.get<T>(key);
}

export async function set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  return adapter.set(key, value, ttlSeconds);
}

export async function wrap<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T> | T,
): Promise<T> {
  return adapter.wrap(key, ttlSeconds, fn);
}

/** Сброс памяти процесса. После приёма пачки счётчики главной не должны врать 10 минут. */
export function clearMemoryCache(): void {
  store().clear();
}

export const cache = adapter;
