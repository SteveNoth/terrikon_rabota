import { avatarToneIndex, initialsFromName } from "@/lib/images/avatar";
import { attr, esc } from "@/ultra/html";

export function renderLetterAvatar(name: string): string {
  const initials = initialsFromName(name);
  const tone = avatarToneIndex(name);
  return `<span class="avatar avatar-${tone}" role="img" aria-label="${attr(`Аватар: ${name}`)}">${esc(initials)}</span>`;
}