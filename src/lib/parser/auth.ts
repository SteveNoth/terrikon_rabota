/**
 * Дверь парсера открывается только с секретом.
 *
 * Bearer-токен — это пароль в заголовке `Authorization: Bearer <секрет>`.
 * Слово Bearer значит «предъявитель»: кто знает секрет, того пускаем.
 * Если секрета нет, короткий или не совпал — 401 без подсказки, что именно не так:
 * иначе злоумышленник отличит «забыли заголовок» от «неверный пароль».
 */

const MIN_SECRET_LENGTH = 32;
const UNAUTHORIZED_BODY = { error: "Unauthorized" };

export function unauthorizedResponse(): Response {
  return Response.json(UNAUTHORIZED_BODY, {
    status: 401,
    headers: { "Cache-Control": "no-store" },
  });
}

export function cronSecret(): string | null {
  const value = process.env.CRON_SECRET?.trim() ?? "";
  if (value.length < MIN_SECRET_LENGTH) {
    return null;
  }
  return value;
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.byteLength; i += 1) {
    diff |= a[i]! ^ b[i]!;
  }
  return diff === 0;
}

export function authorizeParserRequest(request: Request): boolean {
  const expected = cronSecret();
  if (!expected) {
    return false;
  }
  const header = request.headers.get("authorization") ?? request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    return false;
  }
  return timingSafeEqual(match[1]!, expected);
}
