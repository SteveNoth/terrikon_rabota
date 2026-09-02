export const SESSION_COOKIE = "tr_sid";
export const SESSION_HEADER = "x-session-hash";
export const SESSION_MAX_AGE = 60 * 60 * 24;

const HASH = /^[a-f0-9]{32}$/;

export function isSessionHash(value: string | null | undefined): value is string {
  return Boolean(value && HASH.test(value));
}
