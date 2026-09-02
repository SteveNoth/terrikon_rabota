/**
 * Правки словарей с админки. Это обучение фильтра руками:
 * стоп-слово, фраза мошенничества, новая профессия.
 * Пишем в shared/*.json — тот же файл, что читает Python.
 * На Vercel диск эфемерный: если запись не удалась, решение в базе всё равно есть,
 * а словарь нужно внести в репозиторий с машины, где файл живой.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/adapters/db";
import { slugPart } from "@/lib/parser/slug";

const KEYWORDS_PATH = path.join(process.cwd(), "shared", "keywords.json");
const PROFESSIONS_PATH = path.join(process.cwd(), "shared", "professions.json");
const LEARNED_PATH = path.join(process.cwd(), "scripts", "tests", "normalization", "learned.json");

export type DictWriteResult = { ok: true; path: string } | { ok: false; error: string };

async function readJson(file: string): Promise<unknown> {
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as unknown;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(file, body, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function entryId(prefix: string, phrase: string): string {
  const slug = slugPart(phrase).replace(/-/g, "_").slice(0, 40) || "phrase";
  return `${prefix}_${slug}`;
}

export async function addStopWord(phrase: string): Promise<DictWriteResult> {
  const text = phrase.trim().toLocaleLowerCase("ru-RU");
  if (text.length < 3) {
    return { ok: false, error: "Стоп-слово короче трёх символов — так легко задеть честные посты." };
  }
  try {
    const data = asRecord(await readJson(KEYWORDS_PATH));
    if (!data) {
      return { ok: false, error: "Не удалось прочитать keywords.json." };
    }
    const list = Array.isArray(data.stopWords) ? data.stopWords : [];
    const exists = list.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as Record<string, unknown>;
      const phraseValue = typeof row.phrase === "string" ? row.phrase : "";
      const stem = typeof row.stem === "string" ? row.stem : "";
      return phraseValue.toLocaleLowerCase("ru-RU") === text || stem.toLocaleLowerCase("ru-RU") === text;
    });
    if (exists) {
      return { ok: true, path: KEYWORDS_PATH };
    }
    list.push({ id: entryId("admin_stop", text), phrase: text });
    data.stopWords = list;
    await writeJson(KEYWORDS_PATH, data);
    return { ok: true, path: KEYWORDS_PATH };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Не удалось записать keywords.json." };
  }
}

export async function addFraudPhrase(phrase: string): Promise<DictWriteResult> {
  const text = phrase.trim().toLocaleLowerCase("ru-RU");
  if (text.length < 4) {
    return { ok: false, error: "Фраза слишком короткая, в словарь не кладём." };
  }
  try {
    const data = asRecord(await readJson(KEYWORDS_PATH));
    if (!data) {
      return { ok: false, error: "Не удалось прочитать keywords.json." };
    }
    const fraud = asRecord(data.fraud);
    if (!fraud) {
      return { ok: false, error: "В keywords.json нет блока fraud." };
    }
    const list = Array.isArray(fraud.hardFlags) ? fraud.hardFlags : [];
    const exists = list.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const row = item as Record<string, unknown>;
      return typeof row.phrase === "string" && row.phrase.toLocaleLowerCase("ru-RU") === text;
    });
    if (!exists) {
      list.push({
        id: entryId("admin_fraud", text),
        phrase: text,
        label: `ручная пометка: ${text}`,
      });
      fraud.hardFlags = list;
      data.fraud = fraud;
      await writeJson(KEYWORDS_PATH, data);
    }
    return { ok: true, path: KEYWORDS_PATH };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Не удалось записать keywords.json." };
  }
}

export async function addProfession(input: {
  name: string;
  sphere: string;
  synonyms?: string;
}): Promise<DictWriteResult & { slug?: string }> {
  const name = input.name.trim();
  const sphere = input.sphere.trim();
  if (name.length < 2) {
    return { ok: false, error: "Название профессии слишком короткое." };
  }
  if (!sphere) {
    return { ok: false, error: "Нужна сфера из справочника." };
  }
  const slug = slugPart(name) || "profession";
  const synonyms = (input.synonyms ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  try {
    const data = asRecord(await readJson(PROFESSIONS_PATH));
    if (!data || !Array.isArray(data.items)) {
      return { ok: false, error: "Не удалось прочитать professions.json." };
    }
    const items = data.items as Record<string, unknown>[];
    const exists = items.some((item) => item.slug === slug || item.name === name);
    if (!exists) {
      items.push({ slug, name, sphere, synonyms });
      data.items = items;
      await writeJson(PROFESSIONS_PATH, data);
    }
    await prisma.profession.upsert({
      where: { slug },
      create: { slug, name, sphere, synonyms },
      update: { name, sphere, synonyms },
    });
    return { ok: true, path: PROFESSIONS_PATH, slug };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Не удалось записать professions.json." };
  }
}

export type LearnedPost = {
  id: string;
  note: string;
  text: string;
  expected: {
    title: string;
    recordCount: number;
    summaryContains?: string[];
    hasTasks?: boolean;
    hasRequirements?: boolean;
    hasConditions?: boolean;
  };
};

export async function writeLearnedSamples(posts: LearnedPost[]): Promise<DictWriteResult> {
  try {
    await mkdir(path.dirname(LEARNED_PATH), { recursive: true });
    await writeJson(LEARNED_PATH, {
      source: {
        name: "Правки из админки",
        default_city: "gorlovka",
        externalId: "admin-learned",
      },
      posts,
    });
    return { ok: true, path: LEARNED_PATH };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Не удалось записать learned.json." };
  }
}

export function learnedPath(): string {
  return LEARNED_PATH;
}
