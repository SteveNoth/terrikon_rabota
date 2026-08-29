import { DeviceClass } from "@prisma/client";

/**
 * Класс устройства нужен статистике. Строку браузера не сохраняем (Закон 14):
 * смотрим заголовок только здесь, в результат пишем MOBILE или DESKTOP.
 */
export function deviceClassFromUserAgent(userAgent: string | null | undefined): DeviceClass {
  if (!userAgent) {
    return DeviceClass.DESKTOP;
  }
  if (/Mobile|Android|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    return DeviceClass.MOBILE;
  }
  return DeviceClass.DESKTOP;
}

export function isDoNotTrack(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "yes" || normalized === "true";
}
