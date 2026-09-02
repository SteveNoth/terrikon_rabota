/**
 * Проверки кабинета соискателя без браузера.
 * Запуск: npx tsx src/lib/seeker/run-tests.ts
 */
import { seekerProfileSchema, applyMessageSchema } from "@/lib/auth/schemas";
import { isApplyAllowed, APPLY_BLOCKED_MESSAGE } from "@/lib/auth/blocks";
import { vacancyApplyHref } from "@/lib/vacancy/path";
import { RESUME_MAX_CHARS } from "@/lib/seeker/constants";
import { appliedAgoLabel } from "@/lib/seeker/labels";
import { filterSeekerCity, isListedSeekerCity } from "@/lib/seeker/city-filter";
import { generateTelegramLinkCode, isTelegramLinkCode } from "@/lib/seeker/link-code";

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

console.log("Этап 21 — кабинет соискателя");

ok("отклик разрешён без флага APPLY", isApplyAllowed(false));
ok("отклик запрещён при флаге APPLY", !isApplyAllowed(true));
ok("фраза APPLY спокойная", APPLY_BLOCKED_MESSAGE.includes("напишите нам"));
ok("фраза APPLY без слова мошенник", !/мошенник/i.test(APPLY_BLOCKED_MESSAGE));

ok("ссылка отклика ведёт в кабинет", vacancyApplyHref("clxxxxxxxx").startsWith("/profile/apply/"));

const now = new Date("2026-08-31T12:00:00+03:00");
ok(
  "повторный отклик — «Вы откликнулись 3 дня назад»",
  appliedAgoLabel(new Date("2026-08-28T12:00:00+03:00"), now) === "Вы откликнулись 3 дня назад",
);
ok(
  "повторный отклик сегодня",
  appliedAgoLabel(new Date("2026-08-31T08:00:00+03:00"), now) === "Вы откликнулись сегодня",
);

ok("Горловка — активный город списка", isListedSeekerCity("gorlovka"));
ok("Донецк soon не попадает в список откликов", !isListedSeekerCity("donetsk"));
ok(
  "фильтр оставляет только активный город",
  filterSeekerCity(
    [
      { citySlug: "gorlovka", id: "1" },
      { citySlug: "donetsk", id: "2" },
    ],
    null,
  ).map((item) => item.id).join() === "1",
);
ok(
  "фильтр по городу сужает выдачу",
  filterSeekerCity(
    [
      { citySlug: "gorlovka", id: "1" },
      { citySlug: "gorlovka", id: "3" },
    ],
    "gorlovka",
  ).length === 2,
);

const code = generateTelegramLinkCode();
ok("код привязки 8 символов без 0/O/1/I", isTelegramLinkCode(code) && !/[01OI]/.test(code));

const resumeOk = seekerProfileSchema.safeParse({
  name: "Анна",
  citySlug: "gorlovka",
  resumeText: "продавец",
  preferredMode: "lite",
});
ok("короткое резюме проходит", resumeOk.success);

const resumeLong = seekerProfileSchema.safeParse({
  name: "Анна",
  citySlug: "gorlovka",
  resumeText: "я".repeat(RESUME_MAX_CHARS + 1),
  preferredMode: "lite",
});
ok("резюме длиннее 5000 не проходит", !resumeLong.success);

const applyOk = applyMessageSchema.safeParse({ vacancyId: "clxxxxxxxx", message: "здравствуйте" });
ok("сообщение отклика проходит", applyOk.success);

const applyLong = applyMessageSchema.safeParse({
  vacancyId: "clxxxxxxxx",
  message: "м".repeat(RESUME_MAX_CHARS + 1),
});
ok("сообщение отклика длиннее 5000 не проходит", !applyLong.success);

console.log(`\n${passed} прошло, ${failed} упало`);
if (failed > 0) {
  process.exit(1);
}
