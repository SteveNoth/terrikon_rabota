import { ModerationStatus } from "@prisma/client";
import { POLICY_PHRASES, publicPhraseFromFlags } from "@/lib/policy/messages";

export type CabinetStatusLabel = "На сайте" | "На проверке" | "Не опубликовано" | "Снята вами";

export type CabinetVacancyStatus = {
  label: CabinetStatusLabel;
  hint: string;
  listed: boolean;
};

function asFlags(value: unknown): { id: string; label?: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const out: { id: string; label?: string }[] = [];
  for (const item of value) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      const label = (item as { label?: unknown }).label;
      out.push({
        id: (item as { id: string }).id,
        label: typeof label === "string" ? label : undefined,
      });
    }
  }
  return out;
}

/**
 * Человеческий статус для таблицы и формы. Enum в кабинет не показываем.
 */
export function cabinetVacancyStatus(row: {
  isActive: boolean;
  moderationStatus: ModerationStatus | string;
  trustFlags?: unknown;
}): CabinetVacancyStatus {
  const status = String(row.moderationStatus);
  const flags = asFlags(row.trustFlags);
  if (status === "REJECTED" || status === "BLOCKED") {
    return {
      label: "Не опубликовано",
      hint: publicPhraseFromFlags(status, flags),
      listed: false,
    };
  }
  if (status === "PENDING") {
    return {
      label: "На проверке",
      hint: POLICY_PHRASES.pending,
      listed: false,
    };
  }
  if ((status === "AUTO_OK" || status === "APPROVED") && row.isActive) {
    return {
      label: "На сайте",
      hint: POLICY_PHRASES.onSite,
      listed: true,
    };
  }
  if ((status === "AUTO_OK" || status === "APPROVED") && !row.isActive) {
    return {
      label: "Снята вами",
      hint: POLICY_PHRASES.takenDown,
      listed: false,
    };
  }
  return {
    label: "Не опубликовано",
    hint: POLICY_PHRASES.unpublished,
    listed: false,
  };
}

export function saveNoticeFor(status: ModerationStatus | string, publicMessage: string): {
  kind: "notice" | "review" | "error";
  text: string;
} {
  if (status === "AUTO_OK" || status === "APPROVED") {
    return { kind: "notice", text: publicMessage || POLICY_PHRASES.onSite };
  }
  if (status === "PENDING") {
    return { kind: "review", text: POLICY_PHRASES.pending };
  }
  return { kind: "error", text: publicMessage || POLICY_PHRASES.unpublished };
}
