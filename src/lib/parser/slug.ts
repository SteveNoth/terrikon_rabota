import { createHash } from "node:crypto";

const CYR_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function slugPart(value: string): string {
  const folded = value.trim().toLocaleLowerCase("ru-RU");
  let latin = "";
  for (const char of folded) {
    if (CYR_TO_LAT[char] !== undefined) {
      latin += CYR_TO_LAT[char];
      continue;
    }
    if (/[a-z0-9]/.test(char)) {
      latin += char;
      continue;
    }
    latin += "-";
  }
  return latin.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function vacancySlug(input: {
  professionSlug: string | null;
  title: string;
  citySlug: string;
  source: string;
  externalId: string;
}): string {
  const head = slugPart(input.professionSlug || input.title) || "job";
  const tail = createHash("sha1")
    .update(`${input.source}:${input.externalId}`)
    .digest("hex")
    .slice(0, 10);
  return `${head}-${input.citySlug}-${tail}`;
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  const slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

export function employerSlug(input: { inn?: string | null; name: string; citySlug: string }): string {
  const inn = input.inn?.replace(/\D/g, "") ?? "";
  if (inn.length === 10 || inn.length === 12) {
    return `inn-${inn}`;
  }
  const head = slugPart(input.name) || "employer";
  const tail = createHash("sha1").update(`${input.citySlug}:${input.name}`).digest("hex").slice(0, 10);
  return `${head}-${input.citySlug}-${tail}`;
}
