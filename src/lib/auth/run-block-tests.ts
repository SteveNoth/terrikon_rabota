/**
 * Проверки блока аккаунта и разреза очередей без браузера.
 * Запуск: npx tsx src/lib/auth/run-block-tests.ts
 */
import { Source } from "@prisma/client";
import { APPLY_BLOCKED_MESSAGE, LOGIN_BLOCKED_MESSAGE, isApplyAllowed } from "@/lib/auth/blocks";
import { employerQueueWhere, parserQueueWhere } from "@/lib/admin/queue";
import { publicPhraseForRules, POLICY_PHRASES } from "@/lib/policy/messages";

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

console.log("Этап 20A часть 2 — блок и очереди");

ok("отклик разрешён, если флага нет", isApplyAllowed(false));
ok("assertCanApply отказывает при флаге", !isApplyAllowed(true));
ok("фраза LOGIN как user_banned", LOGIN_BLOCKED_MESSAGE === "Этот аккаунт заблокирован");
ok("фраза APPLY без слова мошенник", !/мошенник/i.test(APPLY_BLOCKED_MESSAGE));

const parser = parserQueueWhere();
ok("очередь постов не берёт EMPLOYER", JSON.stringify(parser.source) === JSON.stringify({ not: Source.EMPLOYER }));

const cabinet = employerQueueWhere();
ok("очередь кабинета только EMPLOYER", cabinet.source === Source.EMPLOYER);
ok(
  "очередь кабинета включает PENDING",
  Array.isArray(cabinet.OR) && cabinet.OR.some((item) => "moderationStatus" in item && item.moderationStatus === "PENDING"),
);

ok("запрещённый текст — публичная фраза", publicPhraseForRules(["admin_forbidden"]) === POLICY_PHRASES.forbiddenText);
ok("отклонение кабинета без обвинения", publicPhraseForRules(["admin_reject"]) === POLICY_PHRASES.unpublished);
ok("запрещённый текст без слова мошенничество", !/мошенничеств/i.test(POLICY_PHRASES.forbiddenText));

console.log(`\n${passed} прошло, ${failed} упало`);
if (failed > 0) {
  process.exit(1);
}
