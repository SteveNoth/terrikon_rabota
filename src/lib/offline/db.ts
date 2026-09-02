import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import {
  LEGACY_FAVORITES_KEY,
  OFFLINE_BYTE_LIMIT,
  OFFLINE_DB_NAME,
  OFFLINE_DB_VERSION,
  OFFLINE_SEARCH_LIMIT,
  OFFLINE_VACANCY_LIMIT,
  type OfflineDictEntry,
  type OfflineDictKey,
  type OfflineDictsPayload,
  type OfflineFavorite,
  type OfflineMeta,
  type OfflineSearch,
  type OfflineVacancy,
  type QueuedAction,
} from "@/lib/offline/types";

interface TerrikonOfflineDB extends DBSchema {
  vacancies: {
    key: string;
    value: OfflineVacancy;
    indexes: { savedAt: number };
  };
  favorites: {
    key: string;
    value: OfflineFavorite;
    indexes: { addedAt: number };
  };
  dicts: {
    key: OfflineDictKey;
    value: OfflineDictEntry;
  };
  searches: {
    key: string;
    value: OfflineSearch;
    indexes: { savedAt: number };
  };
  queue: {
    key: string;
    value: QueuedAction;
    indexes: { createdAt: number; status: QueuedAction["status"] };
  };
}

let opening: Promise<IDBPDatabase<TerrikonOfflineDB>> | null = null;

export function isOfflineStorageAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function getOfflineDb(): Promise<IDBPDatabase<TerrikonOfflineDB> | null> {
  if (typeof window === "undefined" || !isOfflineStorageAvailable()) {
    return null;
  }
  if (!opening) {
    opening = openDB<TerrikonOfflineDB>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("vacancies")) {
          const store = db.createObjectStore("vacancies", { keyPath: "id" });
          store.createIndex("savedAt", "savedAt");
        }
        if (!db.objectStoreNames.contains("favorites")) {
          const store = db.createObjectStore("favorites", { keyPath: "vacancyId" });
          store.createIndex("addedAt", "addedAt");
        }
        if (!db.objectStoreNames.contains("dicts")) {
          db.createObjectStore("dicts", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("searches")) {
          const store = db.createObjectStore("searches", { keyPath: "id" });
          store.createIndex("savedAt", "savedAt");
        }
        if (!db.objectStoreNames.contains("queue")) {
          const store = db.createObjectStore("queue", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt");
          store.createIndex("status", "status");
        }
      },
    }).then(async (db) => {
      await migrateLegacyFavorites(db);
      return db;
    });
  }
  try {
    return await opening;
  } catch (cause) {
    console.error("[offline] IndexedDB недоступна", cause);
    opening = null;
    return null;
  }
}

function estimateBytes(value: unknown): number {
  return new Blob([JSON.stringify(value)]).size;
}

async function migrateLegacyFavorites(db: IDBPDatabase<TerrikonOfflineDB>): Promise<void> {
  try {
    const raw = window.localStorage.getItem(LEGACY_FAVORITES_KEY);
    if (!raw) {
      return;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }
    const now = Date.now();
    for (const id of parsed) {
      if (typeof id !== "string" || id.length < 8) {
        continue;
      }
      const existing = await db.get("favorites", id);
      if (existing) {
        continue;
      }
      await db.put("favorites", { vacancyId: id, addedAt: now, vacancy: null });
    }
  } catch {
    // Старый localStorage мог быть битым — избранное из IndexedDB важнее.
  }
}

export async function putVacancies(items: OfflineVacancy[]): Promise<void> {
  const db = await getOfflineDb();
  if (!db || items.length === 0) {
    return;
  }
  const now = Date.now();
  const tx = db.transaction("vacancies", "readwrite");
  for (const item of items) {
    await tx.store.put({ ...item, savedAt: now });
  }
  await tx.done;
  await trimVacancies(db);
  await enforceByteLimit(db);
}

export async function listSavedVacancies(): Promise<OfflineVacancy[]> {
  const db = await getOfflineDb();
  if (!db) {
    return [];
  }
  const items = await db.getAllFromIndex("vacancies", "savedAt");
  return items.reverse();
}

export async function getSavedVacancy(id: string): Promise<OfflineVacancy | undefined> {
  const db = await getOfflineDb();
  if (!db) {
    return undefined;
  }
  return db.get("vacancies", id);
}

export async function putFavoriteRecord(vacancyId: string, vacancy: OfflineVacancy | null): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  await db.put("favorites", {
    vacancyId,
    addedAt: Date.now(),
    vacancy,
  });
  if (vacancy) {
    await db.put("vacancies", { ...vacancy, savedAt: Date.now() });
    await trimVacancies(db);
  }
  await enforceByteLimit(db);
}

export async function putFavorite(vacancy: OfflineVacancy): Promise<void> {
  await putFavoriteRecord(vacancy.id, vacancy);
}

export async function removeFavorite(vacancyId: string): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  await db.delete("favorites", vacancyId);
}

export async function listFavorites(): Promise<OfflineFavorite[]> {
  const db = await getOfflineDb();
  if (!db) {
    return [];
  }
  const items = await db.getAllFromIndex("favorites", "addedAt");
  return items.reverse();
}

export async function isFavorite(vacancyId: string): Promise<boolean> {
  const db = await getOfflineDb();
  if (!db) {
    return false;
  }
  return Boolean(await db.get("favorites", vacancyId));
}

export async function putDicts(payload: OfflineDictsPayload): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  const now = Date.now();
  const tx = db.transaction("dicts", "readwrite");
  if (payload.cities) {
    await tx.store.put({ key: "cities", payload: payload.cities, updatedAt: now });
  }
  if (payload.spheres) {
    await tx.store.put({ key: "spheres", payload: payload.spheres, updatedAt: now });
  }
  if (payload.professions) {
    await tx.store.put({ key: "professions", payload: payload.professions, updatedAt: now });
  }
  await tx.done;
  await enforceByteLimit(db);
}

export async function getDict<T>(key: Exclude<OfflineDictKey, "meta">): Promise<T | null> {
  const db = await getOfflineDb();
  if (!db) {
    return null;
  }
  const entry = await db.get("dicts", key);
  return (entry?.payload as T | undefined) ?? null;
}

export async function setLastUpdated(at = Date.now()): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  const meta: OfflineMeta = { lastUpdated: at };
  await db.put("dicts", { key: "meta", payload: meta, updatedAt: at });
}

export async function getLastUpdated(): Promise<number | null> {
  const db = await getOfflineDb();
  if (!db) {
    return null;
  }
  const entry = await db.get("dicts", "meta");
  const payload = entry?.payload as OfflineMeta | undefined;
  return payload?.lastUpdated ?? null;
}

export async function putSearch(search: Omit<OfflineSearch, "savedAt"> & { savedAt?: number }): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  await db.put("searches", { ...search, savedAt: search.savedAt ?? Date.now() });
  await trimSearches(db);
  await enforceByteLimit(db);
}

export async function listSearches(): Promise<OfflineSearch[]> {
  const db = await getOfflineDb();
  if (!db) {
    return [];
  }
  const items = await db.getAllFromIndex("searches", "savedAt");
  return items.reverse();
}

export async function putQueueAction(action: QueuedAction): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  await db.put("queue", action);
}

export async function getQueueAction(id: string): Promise<QueuedAction | undefined> {
  const db = await getOfflineDb();
  if (!db) {
    return undefined;
  }
  return db.get("queue", id);
}

export async function listQueue(): Promise<QueuedAction[]> {
  const db = await getOfflineDb();
  if (!db) {
    return [];
  }
  const items = await db.getAllFromIndex("queue", "createdAt");
  return items.reverse();
}

export async function listPendingQueue(): Promise<QueuedAction[]> {
  const all = await listQueue();
  return all.filter((item) => item.status === "pending" || item.status === "sending").reverse();
}

export async function deleteQueueAction(id: string): Promise<void> {
  const db = await getOfflineDb();
  if (!db) {
    return;
  }
  await db.delete("queue", id);
}

async function trimVacancies(db: IDBPDatabase<TerrikonOfflineDB>): Promise<void> {
  const items = await db.getAllFromIndex("vacancies", "savedAt");
  const extra = items.length - OFFLINE_VACANCY_LIMIT;
  if (extra <= 0) {
    return;
  }
  const tx = db.transaction("vacancies", "readwrite");
  for (let index = 0; index < extra; index += 1) {
    await tx.store.delete(items[index].id);
  }
  await tx.done;
}

async function trimSearches(db: IDBPDatabase<TerrikonOfflineDB>): Promise<void> {
  const items = await db.getAllFromIndex("searches", "savedAt");
  const extra = items.length - OFFLINE_SEARCH_LIMIT;
  if (extra <= 0) {
    return;
  }
  const tx = db.transaction("searches", "readwrite");
  for (let index = 0; index < extra; index += 1) {
    await tx.store.delete(items[index].id);
  }
  await tx.done;
}

function storeSize(values: unknown[]): number {
  return estimateBytes(values);
}

async function enforceByteLimit(db: IDBPDatabase<TerrikonOfflineDB>): Promise<void> {
  const measure = async () => {
    const [vacancies, favorites, dicts, searches, queue] = await Promise.all([
      db.getAll("vacancies"),
      db.getAll("favorites"),
      db.getAll("dicts"),
      db.getAll("searches"),
      db.getAll("queue"),
    ]);
    return {
      vacancies,
      favorites,
      dicts,
      searches,
      queue,
      bytes:
        storeSize(vacancies) +
        storeSize(favorites) +
        storeSize(dicts) +
        storeSize(searches) +
        storeSize(queue),
    };
  };

  let snapshot = await measure();
  if (snapshot.bytes <= OFFLINE_BYTE_LIMIT) {
    return;
  }

  const vacanciesOldestFirst = [...snapshot.vacancies].sort((a, b) => a.savedAt - b.savedAt);
  for (const item of vacanciesOldestFirst) {
    if (snapshot.bytes <= OFFLINE_BYTE_LIMIT) {
      break;
    }
    await db.delete("vacancies", item.id);
    snapshot = await measure();
  }

  const searchesOldestFirst = [...snapshot.searches].sort((a, b) => a.savedAt - b.savedAt);
  for (const item of searchesOldestFirst) {
    if (snapshot.bytes <= OFFLINE_BYTE_LIMIT) {
      break;
    }
    await db.delete("searches", item.id);
    snapshot = await measure();
  }

  const sent = snapshot.queue.filter((item) => item.status === "sent").sort((a, b) => a.createdAt - b.createdAt);
  for (const item of sent) {
    if (snapshot.bytes <= OFFLINE_BYTE_LIMIT) {
      break;
    }
    await db.delete("queue", item.id);
    snapshot = await measure();
  }
}
