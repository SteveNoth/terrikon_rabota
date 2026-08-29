import {
  deleteQueueAction,
  getQueueAction,
  listPendingQueue,
  listQueue,
  putFavoriteRecord,
  putQueueAction,
  removeFavorite,
} from "@/lib/offline/db";
import { OFFLINE_EVENT, type OfflineEventDetail, type OfflineVacancy, type QueuedAction } from "@/lib/offline/types";

const FLUSH_LOCK = "tr-offline-flush";
let flushing = false;

function emit(detail: OfflineEventDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent<OfflineEventDetail>(OFFLINE_EVENT, { detail }));
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `oa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function withFlushLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks?.request) {
    return locks.request(FLUSH_LOCK, work);
  }
  if (flushing) {
    return undefined as T;
  }
  flushing = true;
  try {
    return await work();
  } finally {
    flushing = false;
  }
}

export async function enqueueAction(
  input: Pick<QueuedAction, "type" | "op" | "vacancyId" | "title" | "href">,
): Promise<QueuedAction> {
  const all = await listQueue();
  const oppositeOp = input.op === "add" ? "remove" : "add";
  const opposite = all.find(
    (item) =>
      item.type === input.type &&
      item.op === oppositeOp &&
      item.vacancyId === input.vacancyId &&
      (item.status === "pending" || item.status === "sending"),
  );
  if (opposite) {
    await deleteQueueAction(opposite.id);
    if (input.op === "remove") {
      return { ...opposite, op: "remove", status: "sent", sentAt: Date.now() };
    }
  }

  const existing = all.find(
    (item) =>
      item.type === input.type &&
      item.op === input.op &&
      item.vacancyId === input.vacancyId &&
      (item.status === "pending" || item.status === "sending"),
  );
  if (existing) {
    return existing;
  }

  if (input.type === "apply") {
    const alreadySent = (await listQueue()).find(
      (item) => item.type === "apply" && item.vacancyId === input.vacancyId && item.status === "sent",
    );
    if (alreadySent) {
      return alreadySent;
    }
  }

  const action: QueuedAction = {
    id: newId(),
    type: input.type,
    op: input.op,
    vacancyId: input.vacancyId,
    title: input.title,
    href: input.href,
    createdAt: Date.now(),
    status: "pending",
  };
  await putQueueAction(action);
  return action;
}

export async function enqueueApply(input: {
  vacancyId: string;
  title: string;
  href?: string;
}): Promise<QueuedAction> {
  return enqueueAction({ type: "apply", op: "add", ...input });
}

export async function enqueueFavoriteToggle(input: {
  vacancyId: string;
  title: string;
  href?: string;
  add: boolean;
  vacancy?: OfflineVacancy | null;
}): Promise<QueuedAction> {
  if (input.add) {
    await putFavoriteRecord(input.vacancyId, input.vacancy ?? null);
  } else {
    await removeFavorite(input.vacancyId);
  }
  return enqueueAction({
    type: "favorite",
    op: input.add ? "add" : "remove",
    vacancyId: input.vacancyId,
    title: input.title,
    href: input.href,
  });
}

async function sendAction(action: QueuedAction): Promise<boolean> {
  const latest = (await getQueueAction(action.id)) ?? action;
  if (latest.status === "sent") {
    return true;
  }

  await putQueueAction({ ...latest, status: "sending" });

  try {
    const response = await fetch("/api/offline/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        id: latest.id,
        type: latest.type,
        op: latest.op,
        vacancyId: latest.vacancyId,
      }),
    });

    if (!response.ok) {
      await putQueueAction({ ...latest, status: "pending" });
      return false;
    }

    await putQueueAction({ ...latest, status: "sent", sentAt: Date.now() });

    if (latest.type === "apply") {
      emit({ kind: "apply-sent", vacancyId: latest.vacancyId, title: latest.title });
    } else {
      emit({ kind: "favorite-sent", vacancyId: latest.vacancyId });
    }
    return true;
  } catch {
    await putQueueAction({ ...latest, status: "pending" });
    return false;
  }
}

export async function flushQueue(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return;
  }

  await withFlushLock(async () => {
    const pending = await listPendingQueue();
    for (const action of pending) {
      const ok = await sendAction(action);
      if (!ok) {
        break;
      }
    }
    await pruneSent();
  });
}

async function pruneSent(): Promise<void> {
  const week = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const all = await listQueue();
  for (const item of all) {
    if (item.status === "sent" && item.sentAt && now - item.sentAt > week) {
      await deleteQueueAction(item.id);
    }
  }
}

export async function hasPendingApply(vacancyId: string): Promise<boolean> {
  const pending = await listPendingQueue();
  return pending.some((item) => item.type === "apply" && item.vacancyId === vacancyId);
}

export async function hasSentApply(vacancyId: string): Promise<boolean> {
  const all = await listQueue();
  return all.some((item) => item.type === "apply" && item.vacancyId === vacancyId && item.status === "sent");
}
