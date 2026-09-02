/**
 * Единственная точка решения для формы кабинета (раздел 11.22, Закон 18).
 *
 * Порядок нельзя переставлять: сначала замок PUBLISH и чёрный список контакта,
 * потом явный СВО, скрытый СВО по полям, жёсткий fraud, стоп-слова как политика
 * содержания, затем оценка доверия. Контур парсера (нарезка, OCR, фильтр «это
 * вакансия?») отсюда не вызываем: поля формы уже разобраны, короткий кадровый
 * текст — не мусор стены.
 *
 * isVerified — ускоритель AUTO_OK и бейдж, не замок на форму. Иначе мелкий магазин
 * Горловки не разместит продавца: не станет писать в Telegram ради одной вакансии.
 * Непроверенная компания может сохранить карточку; она уйдёт на проверку, не на сайт.
 */

import { ModerationStatus } from "@prisma/client";
import { compiled, filterWeights, getFraud } from "@/lib/policy/dictionaries";
import { POLICY_PHRASES, assertPublicPhrase, publicPhraseForRules } from "@/lib/policy/messages";
import { explicitSvo, hiddenSvo } from "@/lib/policy/svo";
import { iterHits, normalizeText } from "@/lib/policy/text";
import { scanHardFlags, scoreTrust } from "@/lib/policy/trust";
import type {
  PolicyContext,
  PolicyDecision,
  PolicyFlag,
  PolicyVacancyInput,
  PolicyWorkFormat,
} from "@/lib/policy/types";

function asWorkFormat(value: string | null | undefined): PolicyWorkFormat {
  const token = String(value || "LOCAL").toUpperCase();
  if (token === "VAHTA" || token === "REMOTE" || token === "LOCAL") {
    return token;
  }
  return "LOCAL";
}

function flag(id: string, label: string, sample = "", hard = false): PolicyFlag {
  return { id, points: 0, label, sample, detail: "", hard };
}

function finish(partial: Omit<PolicyDecision, "publicMessage" | "ruleIds"> & { publicMessage?: string }): PolicyDecision {
  const ruleIds = [...new Set(partial.trustFlags.map((item) => item.id))];
  const publicMessage = assertPublicPhrase(partial.publicMessage || publicPhraseForRules(ruleIds));
  return { ...partial, ruleIds, publicMessage };
}

function analysisText(input: PolicyVacancyInput): string {
  return `${input.title || ""}\n${input.description || ""}`.trim();
}

function contentPolicy(text: string): { verdict: "reject" | "pending" | "clear"; flags: PolicyFlag[] } {
  const body = normalizeText(text);
  const weights = filterWeights();
  const flags: PolicyFlag[] = [];
  let score = 0;
  for (const hit of iterHits(compiled.stopWords, body)) {
    const id = `stop:${hit.entry.id || hit.sample}`;
    flags.push({
      id,
      points: Number(weights.stopWord || -40),
      label: String(hit.entry.label || hit.entry.id || "стоп-слово"),
      sample: hit.sample,
      detail: "",
      hard: false,
    });
    score += Number(weights.stopWord || -40);
  }
  for (const hit of iterHits(compiled.ads, body)) {
    const id = `ads:${hit.entry.id || hit.sample}`;
    flags.push({
      id,
      points: Number(weights.ads || -25),
      label: String(hit.entry.label || hit.entry.id || "реклама"),
      sample: hit.sample,
      detail: "",
      hard: false,
    });
    score += Number(weights.ads || -25);
  }
  if (flags.length === 0) {
    return { verdict: "clear", flags };
  }
  const rejectAt = Number(weights.stopWord || -40);
  if (score <= rejectAt) {
    return { verdict: "reject", flags };
  }
  return { verdict: "pending", flags };
}

export function evaluateEmployerVacancy(input: PolicyVacancyInput, context: PolicyContext): PolicyDecision {
  const base = {
    hoursPerDay: null as number | null,
    monthlySalary: null as number | null,
    highRisk: false,
    shouldBlacklistContact: false,
    goesToQueue: false,
    usedDictionaries: false,
  };

  if (context.publishBlocked) {
    return finish({
      ...base,
      moderationStatus: ModerationStatus.REJECTED,
      trustScore: 0,
      trustFlags: [flag("publish_blocked", "публикация аккаунта отключена")],
      publicMessage: POLICY_PHRASES.publishBlocked,
      usedDictionaries: false,
    });
  }

  if (context.contactVerdict === "BLOCKED") {
    return finish({
      ...base,
      moderationStatus: ModerationStatus.REJECTED,
      trustScore: 0,
      trustFlags: [flag("blacklisted_contact", "контакт из чёрного списка", input.contactPhone || input.contactTelegram || "")],
      publicMessage: POLICY_PHRASES.blacklistedContact,
      usedDictionaries: false,
    });
  }

  const text = analysisText(input);
  const fmt = asWorkFormat(String(input.workFormat));
  const market = context.market ?? null;

  const explicit = explicitSvo(text);
  if (explicit.verdict === "reject") {
    return finish({
      ...base,
      moderationStatus: ModerationStatus.REJECTED,
      trustScore: 0,
      trustFlags: [flag("explicit_svo", "явный набор"), ...explicit.flags],
      publicMessage: POLICY_PHRASES.notCivilianJob,
      usedDictionaries: true,
    });
  }

  const hidden = hiddenSvo(input, market);
  if (hidden.verdict === "reject") {
    return finish({
      ...base,
      moderationStatus: ModerationStatus.REJECTED,
      trustScore: 0,
      trustFlags: hidden.flags,
      publicMessage: POLICY_PHRASES.notCivilianJob,
      usedDictionaries: true,
    });
  }

  const hard = scanHardFlags({
    text,
    professionSlug: input.professionSlug,
    salaryFrom: input.salaryFrom,
    salaryTo: input.salaryTo,
    salaryPeriod: input.salaryPeriod,
    workFormat: fmt,
    market,
  });
  if (hard.hard) {
    return finish({
      ...base,
      moderationStatus: ModerationStatus.BLOCKED,
      trustScore: 0,
      trustFlags: hard.flags,
      publicMessage: publicPhraseForRules(hard.flags.map((item) => item.id)),
      shouldBlacklistContact: true,
      highRisk: true,
      usedDictionaries: true,
    });
  }

  const content = contentPolicy(text);
  if (content.verdict === "reject") {
    return finish({
      ...base,
      moderationStatus: ModerationStatus.REJECTED,
      trustScore: 0,
      trustFlags: content.flags,
      publicMessage: POLICY_PHRASES.courses,
      usedDictionaries: true,
    });
  }

  const trust = scoreTrust({
    vacancy: input,
    text,
    market,
    contactVerdict: context.contactVerdict,
  });

  const flags: PolicyFlag[] = [];
  if (explicit.verdict === "maybe") {
    flags.push(flag("explicit_svo_maybe", "сомнение по явному набору"));
  }
  if (hidden.verdict === "maybe") {
    flags.push(...hidden.flags.filter((item) => item.id === "hidden_svo_maybe" || item.points > 0));
  }
  if (content.verdict === "pending") {
    flags.push(...content.flags);
  }
  flags.push(...trust.flags);
  if (!context.isVerified) {
    flags.push(flag("unverified_company", "компания без отметки проверки"));
  }

  const publishAt = Number(getFraud().thresholds.publish || 70);
  const doubt =
    explicit.verdict === "maybe" ||
    hidden.verdict === "maybe" ||
    content.verdict === "pending" ||
    trust.newContact ||
    !context.isVerified ||
    trust.score < publishAt;

  if (doubt) {
    return finish({
      hoursPerDay: trust.hoursPerDay,
      monthlySalary: trust.monthlySalary,
      moderationStatus: ModerationStatus.PENDING,
      trustScore: trust.score,
      trustFlags: flags,
      publicMessage: POLICY_PHRASES.pending,
      goesToQueue: true,
      shouldBlacklistContact: false,
      highRisk: trust.highRisk,
      usedDictionaries: true,
    });
  }

  return finish({
    hoursPerDay: trust.hoursPerDay,
    monthlySalary: trust.monthlySalary,
    moderationStatus: ModerationStatus.AUTO_OK,
    trustScore: trust.score,
    trustFlags: flags,
    publicMessage: POLICY_PHRASES.onSite,
    goesToQueue: false,
    shouldBlacklistContact: false,
    highRisk: false,
    usedDictionaries: true,
  });
}

export function occupiesEmployerLimit(status: ModerationStatus | string, isActive: boolean): boolean {
  if (!isActive) {
    return false;
  }
  return status === ModerationStatus.PENDING || status === ModerationStatus.AUTO_OK || status === ModerationStatus.APPROVED;
}
