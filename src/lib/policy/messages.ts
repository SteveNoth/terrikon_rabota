/**
 * Публичные фразы кабинета. Сюда не попадают id правил и слова «мошенничество», «вербовка», «СВО».
 * Как src/lib/auth/messages.ts для входа: кабинет и письма читают только этот файл.
 */

export const POLICY_PHRASES = {
  prepaid:
    "Такой текст мы не публикуем: в объявлении есть требование оплаты или залога от соискателя.",
  pending: "Объявление отправлено на проверку. На сайте его пока нет.",
  blacklistedContact: "Этот телефон нельзя использовать для публикации.",
  publishBlocked: "Публикация с этого аккаунта отключена. Если это ошибка — напишите нам.",
  forbiddenText: "Такой текст мы не публикуем.",
  notCivilianJob: "Такой текст мы не публикуем: это объявление не про гражданскую работу.",
  courses: "Такой текст мы не публикуем: это похоже на рекламу курсов или услуг, а не на вакансию.",
  onSite: "Вакансия на сайте.",
  updatedOnSite: "Вакансия обновлена. Она на сайте.",
  takenDown: "Вакансия снята вами. На сайте её нет.",
  unpublished: "Вакансия не опубликована.",
} as const;

const PREPAID_IDS = new Set([
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
]);

const FORBIDDEN_IDS = new Set([
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
]);

const SVO_IDS = new Set(["explicit_svo", "hidden_svo"]);

const BANNED_PUBLIC = [/мошенничеств/i, /вербовк/i, /\bсво\b/i, /\bPENDING\b/, /\bBLOCKED\b/, /\bREJECTED\b/, /\bAUTO_OK\b/];

export function assertPublicPhrase(text: string): string {
  for (const test of BANNED_PUBLIC) {
    if (test.test(text)) {
      return POLICY_PHRASES.unpublished;
    }
  }
  if (/\b(predoplata|hidden_svo|explicit_svo|oformit_kartu)\b/i.test(text)) {
    return POLICY_PHRASES.unpublished;
  }
  return text;
}

export function publicPhraseForRules(ruleIds: string[]): string {
  if (ruleIds.includes("admin_forbidden")) {
    return POLICY_PHRASES.forbiddenText;
  }
  if (ruleIds.includes("admin_reject")) {
    return POLICY_PHRASES.unpublished;
  }
  if (ruleIds.includes("publish_blocked")) {
    return POLICY_PHRASES.publishBlocked;
  }
  if (ruleIds.includes("blacklisted_contact")) {
    return POLICY_PHRASES.blacklistedContact;
  }
  if (ruleIds.some((id) => PREPAID_IDS.has(id))) {
    return POLICY_PHRASES.prepaid;
  }
  if (ruleIds.some((id) => FORBIDDEN_IDS.has(id))) {
    return POLICY_PHRASES.forbiddenText;
  }
  if (ruleIds.some((id) => SVO_IDS.has(id))) {
    return POLICY_PHRASES.notCivilianJob;
  }
  if (ruleIds.some((id) => id.startsWith("stop:") || id === "content_stop")) {
    return POLICY_PHRASES.courses;
  }
  if (ruleIds.includes("content_ads") || ruleIds.includes("new_contact") || ruleIds.includes("unverified_company")) {
    return POLICY_PHRASES.pending;
  }
  return POLICY_PHRASES.pending;
}

export function publicPhraseFromFlags(
  status: string,
  flags: { id: string; label?: string }[],
): string {
  if (status === "AUTO_OK" || status === "APPROVED") {
    return POLICY_PHRASES.onSite;
  }
  if (status === "PENDING") {
    return POLICY_PHRASES.pending;
  }
  if (status === "REJECTED") {
    const custom = flags.find((flag) => flag.id === "admin_reject" && flag.label?.trim());
    if (custom?.label) {
      return assertPublicPhrase(custom.label.trim());
    }
  }
  return assertPublicPhrase(publicPhraseForRules(flags.map((flag) => flag.id)));
}
