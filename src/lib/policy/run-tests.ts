/**
 * Тесты кабинетной политики без браузера.
 * Запуск: npx tsx src/lib/policy/run-tests.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateEmployerVacancy } from "@/lib/policy/decide";
import { cabinetVacancyStatus } from "@/lib/policy/status";
import type { MarketSnapshot, PolicyContext, PolicyVacancyInput } from "@/lib/policy/types";
import corpus from "@/lib/policy/corpus.json";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Expectation = {
  status?: string;
  notStatus?: string;
  notStatus2?: string;
  goesToQueue?: boolean;
  shouldBlacklistContact?: boolean;
  rule?: string;
  notRule?: string;
  usedDictionaries?: boolean;
  minScore?: number;
};

let failed = 0;
let passed = 0;

function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}

function baseVacancy(partial: Record<string, unknown>): PolicyVacancyInput {
  return {
    title: String(partial.title ?? "Продавец"),
    description: String(partial.description ?? ""),
    professionSlug: (partial.professionSlug as string | null | undefined) ?? "prodavets",
    salaryFrom: (partial.salaryFrom as number | null | undefined) ?? 35000,
    salaryTo: (partial.salaryTo as number | null | undefined) ?? null,
    salaryPeriod: (partial.salaryPeriod as string | null | undefined) ?? "MONTH",
    workFormat: String(partial.workFormat ?? "LOCAL"),
    citySlug: "gorlovka",
    contactPhone: (partial.contactPhone as string | null | undefined) ?? "+7 949 111-22-33",
    contactTelegram: (partial.contactTelegram as string | null | undefined) ?? null,
    employerName: "Магазин на Мира",
    employerId: "emp-1",
    userId: "user-1",
    housingProvided: Boolean(partial.housingProvided),
    rotationPattern: (partial.rotationPattern as string | null | undefined) ?? null,
    vahtaDays: (partial.vahtaDays as number | null | undefined) ?? null,
    workLocationText: (partial.workLocationText as string | null | undefined) ?? null,
  };
}

function baseContext(partial: Record<string, unknown> | undefined, market: MarketSnapshot): PolicyContext {
  return {
    publishBlocked: Boolean(partial?.publishBlocked),
    contactVerdict: (partial?.contactVerdict as PolicyContext["contactVerdict"]) ?? null,
    isVerified: Boolean(partial?.isVerified),
    market,
  };
}

function publicSafe(text: string, name: string): void {
  ok(
    `${name} public phrase`,
    !/мошенничеств|вербовк|\bСВО\b|\bPENDING\b|\bBLOCKED\b|\bREJECTED\b|predoplata|hidden_svo|oformit_kartu/i.test(text),
    text,
  );
}

function runCase(item: {
  id: string;
  note: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
  expect: Expectation;
}, market: MarketSnapshot): void {
  const decision = evaluateEmployerVacancy(baseVacancy(item.input), baseContext(item.context, market));
  const exp = item.expect;
  const shown = `${item.id}: ${item.note}`;
  if (exp.status) {
    ok(`${shown} status`, decision.moderationStatus === exp.status, `got ${decision.moderationStatus}`);
  }
  if (exp.notStatus) {
    ok(`${shown} not ${exp.notStatus}`, decision.moderationStatus !== exp.notStatus, `got ${decision.moderationStatus}`);
  }
  if (exp.notStatus2) {
    ok(`${shown} not ${exp.notStatus2}`, decision.moderationStatus !== exp.notStatus2, `got ${decision.moderationStatus}`);
  }
  if (exp.goesToQueue != null) {
    ok(`${shown} queue`, decision.goesToQueue === exp.goesToQueue, `got ${decision.goesToQueue}`);
  }
  if (exp.shouldBlacklistContact != null) {
    ok(`${shown} blacklist`, decision.shouldBlacklistContact === exp.shouldBlacklistContact);
  }
  if (exp.rule) {
    ok(`${shown} rule ${exp.rule}`, decision.ruleIds.includes(exp.rule), decision.ruleIds.join(","));
  }
  if (exp.notRule) {
    ok(`${shown} not rule ${exp.notRule}`, !decision.ruleIds.includes(exp.notRule), decision.ruleIds.join(","));
  }
  if (exp.usedDictionaries != null) {
    ok(`${shown} dictionaries`, decision.usedDictionaries === exp.usedDictionaries);
  }
  if (exp.minScore != null) {
    ok(`${shown} score`, decision.trustScore >= exp.minScore, `got ${decision.trustScore}`);
  }
  publicSafe(decision.publicMessage, item.id);
  const human = cabinetVacancyStatus({
    isActive: true,
    moderationStatus: decision.moderationStatus,
    trustFlags: decision.trustFlags,
  });
  ok(`${item.id} human label`, Boolean(human.label) && !/PENDING|BLOCKED|REJECTED|AUTO_OK/.test(human.label));
  publicSafe(human.hint, `${item.id} hint`);
}

function loadJson(rel: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

function pythonPrepaid(): void {
  const data = loadJson("scripts/tests/fraud/samples.json") as {
    samples: { id: string; kind: string; text: string; expectedStatus: string }[];
  };
  const market = corpus.market as MarketSnapshot;
  for (const sample of data.samples) {
    if (sample.kind !== "prepaid") {
      continue;
    }
    const decision = evaluateEmployerVacancy(
      baseVacancy({ title: "Вакансия", description: sample.text, professionSlug: "prodavets", salaryFrom: 40000 }),
      baseContext({ contactVerdict: null, isVerified: false }, market),
    );
    ok(
      `python prepaid ${sample.id}`,
      decision.moderationStatus === "BLOCKED" && decision.goesToQueue === false,
      `got ${decision.moderationStatus} queue=${decision.goesToQueue}`,
    );
  }
}

function pythonExplicitSvo(): void {
  const data = loadJson("scripts/tests/svo/samples.json") as {
    posts: { id: string; kind: string; expected: string; text: string }[];
  };
  const market = corpus.market as MarketSnapshot;
  for (const sample of data.posts) {
    if (sample.kind !== "explicit" || sample.expected !== "reject") {
      continue;
    }
    const decision = evaluateEmployerVacancy(
      baseVacancy({ title: "Вакансия", description: sample.text, professionSlug: "prodavets", salaryFrom: 40000 }),
      baseContext({}, market),
    );
    ok(
      `python explicit svo ${sample.id}`,
      decision.moderationStatus === "REJECTED" && decision.ruleIds.includes("explicit_svo"),
      `got ${decision.moderationStatus} ${decision.ruleIds.join(",")}`,
    );
  }
}

function extraInvariants(): void {
  const market = corpus.market as MarketSnapshot;
  const source =
    fs.readFileSync(path.join(ROOT, "src/lib/repo/employer.ts"), "utf8") +
    fs.readFileSync(path.join(ROOT, "src/lib/policy/decide.ts"), "utf8") +
    fs.readFileSync(path.join(ROOT, "src/lib/policy/index.ts"), "utf8");
  ok("no process_post call in door", !/process_post\s*\(/.test(source) && !/from ["'].*process["']/.test(source));
  ok("no is_vacancy call in door", !/is_vacancy\s*\(/.test(source));
  ok("no trustScore: 80 in employer repo", !/trustScore:\s*80/.test(fs.readFileSync(path.join(ROOT, "src/lib/repo/employer.ts"), "utf8")));

  const verifiedNewPhone = evaluateEmployerVacancy(
    baseVacancy({
      title: "Продавец",
      description: "Продавец в продуктовый магазин. График 2/2. Оклад 35 000 рублей. Горловка.",
      salaryFrom: 35000,
    }),
    baseContext({ isVerified: true, contactVerdict: null }, market),
  );
  ok("isVerified without TRUSTED is PENDING", verifiedNewPhone.moderationStatus === "PENDING");

  const trustedUnverified = evaluateEmployerVacancy(
    baseVacancy({
      title: "Продавец",
      description: "Продавец в продуктовый магазин. График 2/2. Оклад 35 000 рублей. Горловка.",
      salaryFrom: 35000,
    }),
    baseContext({ isVerified: false, contactVerdict: "TRUSTED" }, market),
  );
  ok("TRUSTED without isVerified is PENDING", trustedUnverified.moderationStatus === "PENDING");
}

function main(): void {
  console.log("policy corpus");
  const market = corpus.market as MarketSnapshot;
  for (const item of corpus.cases) {
    runCase(item, market);
  }
  console.log("python fraud prepaid");
  pythonPrepaid();
  console.log("python svo explicit reject");
  pythonExplicitSvo();
  console.log("invariants");
  extraInvariants();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
