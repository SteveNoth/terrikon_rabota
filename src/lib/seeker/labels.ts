import { ApplicationStatus } from "@prisma/client";
import { formatDate } from "@/lib/format/date";
import { APPLY_ALREADY_PREFIX } from "@/lib/seeker/constants";

export const SEEKER_APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
  SENT: "отправлен",
  VIEWED: "просмотрен",
  INVITED: "приглашение",
  REJECTED: "отказ",
};

/** «Вы откликнулись 3 дня назад», «Вы откликнулись сегодня». */
export function appliedAgoLabel(at: Date | string, now = new Date()): string {
  const when = formatDate(at, now);
  if (!when) {
    return APPLY_ALREADY_PREFIX;
  }
  return `${APPLY_ALREADY_PREFIX} ${when}`;
}

export const QUALITY_PREFERENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Авто (рекомендуется)" },
  { value: "full", label: "Полное — красиво, больше трафика" },
  { value: "lite", label: "Экономное — быстро, мало трафика" },
  { value: "ultra", label: "Только текст — работает даже на 2G" },
];

export type ApplyUiState = {
  signedIn: boolean;
  appliedAt: Date | null;
  blocked: boolean;
  blockedMessage: string;
};
