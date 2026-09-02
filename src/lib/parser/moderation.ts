import { ContactVerdictKind, ModerationStatus } from "@prisma/client";

const HARD_FLAG_IDS = new Set([
  "predoplata",
  "vstupitelnyy_vznos",
  "vznos_za_trud",
  "zalog_za_formu",
  "zalog_za_instrument",
  "oplatit_obuchenie",
  "oplata_obucheniya",
  "kupit_nabor",
  "startovyy_nabor",
  "vnesti_depozit",
  "oformit_kartu",
  "karta_na_svoe_imya",
  "pasport_dlya_oformleniya",
  "sim_karty",
  "podstavnoe_lico",
  "obnal",
  "klady",
  "rasfasovka",
  "courier_daily_high",
  "trafficking_combo",
  "blacklisted_contact",
]);

export type TrustFlagIn = {
  id: string;
  points?: number;
  hard?: boolean;
};

/**
 * Статус модерации решает, попадёт ли вакансия на сайт (Закон 18).
 * Автопубликации по таймеру нет: не проверил — значит, не опубликовано.
 *
 * Чёрный список — сразу BLOCKED, без баллов.
 * Жёсткий флаг — BLOCKED, телефон в ContactVerdict, в очередь не идёт.
 * ≥ 70 и контакт уже TRUSTED — AUTO_OK.
 * Иначе PENDING: на сайте не появляется вообще.
 */
export function decideModeration(input: {
  trustScore: number;
  flags: TrustFlagIn[];
  hard?: boolean | null;
  parserStatus?: ModerationStatus | null;
  contactVerdict: ContactVerdictKind | null;
}): { status: ModerationStatus; hard: boolean; blacklisted: boolean } {
  if (input.contactVerdict === ContactVerdictKind.BLOCKED) {
    return { status: ModerationStatus.BLOCKED, hard: true, blacklisted: true };
  }

  const hardFromFlags = input.flags.some((flag) => flag.hard === true || HARD_FLAG_IDS.has(flag.id));
  const hard = Boolean(input.hard) || input.parserStatus === ModerationStatus.BLOCKED || hardFromFlags;
  if (hard) {
    return { status: ModerationStatus.BLOCKED, hard: true, blacklisted: false };
  }

  if (input.trustScore >= 70 && input.contactVerdict === ContactVerdictKind.TRUSTED) {
    return { status: ModerationStatus.AUTO_OK, hard: false, blacklisted: false };
  }

  return { status: ModerationStatus.PENDING, hard: false, blacklisted: false };
}

export function isHardFlagId(id: string): boolean {
  return HARD_FLAG_IDS.has(id);
}
