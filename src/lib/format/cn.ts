import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Склеивает классы и снимает конфликты Tailwind.
 *
 * clsx собирает список: пропускает false/undefined и принимает объекты условий.
 * tailwind-merge нужен потому, что в Tailwind побеждает не «последний смысл», а порядок
 * в итоговом CSS. Без merge вызов cn("p-2", "p-4") может оставить оба класса,
 * и на экране останется p-2. merge оставляет только p-4.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
