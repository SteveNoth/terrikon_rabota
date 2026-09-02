export const OFFLINE_DB_NAME = "terrikon-offline";
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_BYTE_LIMIT = 5 * 1024 * 1024;
export const OFFLINE_VACANCY_LIMIT = 100;
export const OFFLINE_SEARCH_LIMIT = 5;
export const LEGACY_FAVORITES_KEY = "tr_favorites";
export const OFFLINE_EVENT = "tr-offline";

export type OfflineVacancy = {
  id: string;
  slug: string;
  title: string;
  href: string;
  citySlug: string;
  districtSlug: string | null;
  salaryText: string;
  summaryLine: string | null;
  workFormat: string;
  workLocationText: string | null;
  employerName: string | null;
  publishedAt: string;
  savedAt: number;
};

export type OfflineFavorite = {
  vacancyId: string;
  addedAt: number;
  vacancy: OfflineVacancy | null;
};

export type OfflineDictKey = "cities" | "spheres" | "professions" | "meta";

export type OfflineDictEntry = {
  key: OfflineDictKey;
  payload: unknown;
  updatedAt: number;
};

export type OfflineMeta = {
  lastUpdated: number | null;
};

export type OfflineSearch = {
  id: string;
  query: string;
  citySlug: string;
  href: string;
  titles: string[];
  savedAt: number;
};

export type QueueActionType = "apply" | "favorite";
export type QueueOp = "add" | "remove";
export type QueueStatus = "pending" | "sending" | "sent";

export type QueuedAction = {
  id: string;
  type: QueueActionType;
  op: QueueOp;
  vacancyId: string;
  title: string;
  href?: string;
  message?: string;
  createdAt: number;
  status: QueueStatus;
  sentAt?: number;
};

export type OfflineEventDetail =
  | { kind: "apply-sent"; vacancyId: string; title: string }
  | { kind: "apply-need-login"; vacancyId: string }
  | { kind: "apply-queued"; vacancyId: string }
  | { kind: "favorite-sent"; vacancyId: string }
  | { kind: "favorite-queued"; vacancyId: string }
  | { kind: "back-online" };

export type OfflineDictsPayload = {
  cities?: { slug: string; name: string }[];
  spheres?: { slug: string; name: string }[];
  professions?: { slug: string; name: string; sphere: string }[];
};
