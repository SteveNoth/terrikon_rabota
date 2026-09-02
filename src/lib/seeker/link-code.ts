const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** Короткий код без 0/O/1/I — его наберут с телефона. */
export function generateTelegramLinkCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

export function isTelegramLinkCode(value: string | null | undefined): boolean {
  if (!value || value.length !== CODE_LENGTH) {
    return false;
  }
  return [...value].every((char) => ALPHABET.includes(char));
}
