import keywordsJson from "@shared/keywords.json";
import { getProfession } from "@/lib/professions";
import { compileTerms, type CompiledTerm } from "@/lib/policy/text";
import type { KeywordEntry } from "@/lib/policy/types";

type KeywordsFile = typeof keywordsJson;

function asEntries(value: unknown): KeywordEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is KeywordEntry => Boolean(item) && typeof item === "object");
}

const keywords = keywordsJson as KeywordsFile;
const fraud = keywords.fraud;
const svo = keywords.svo;

export const compiled = {
  stopWords: compileTerms(asEntries(keywords.stopWords)),
  ads: compileTerms(asEntries(keywords.ads)),
  svoExplicit: compileTerms(asEntries(svo.explicit)),
  hardFlags: compileTerms(asEntries(fraud.hardFlags)),
  fastMoney: compileTerms(asEntries(fraud.fastMoney)),
  privacy: compileTerms(asEntries(fraud.privacy)),
  denials: compileTerms(asEntries(fraud.denials)),
  abroad: compileTerms(asEntries(fraud.abroad)),
  documentsHelp: compileTerms(asEntries(fraud.documentsHelp)),
  klady: compileTerms(asEntries(fraud.klady)),
  dailyPay: compileTerms(asEntries(fraud.dailyPay)),
};

export function getKeywords(): KeywordsFile {
  return keywords;
}

export function getFraud() {
  return fraud;
}

export function getSvo() {
  return svo;
}

export function filterWeights() {
  return keywords.weights;
}

export function professionSphere(slug: string | null | undefined): string | null {
  if (!slug) {
    return null;
  }
  return getProfession(slug)?.sphere ?? null;
}

export function professionName(slug: string | null | undefined): string {
  if (!slug) {
    return "без профессии";
  }
  return getProfession(slug)?.name ?? slug;
}

export function compiledGroup(name: keyof typeof compiled): CompiledTerm[] {
  return compiled[name];
}
