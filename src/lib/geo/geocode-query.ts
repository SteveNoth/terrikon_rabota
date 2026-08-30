/**
 * Ключ кэша геокодера. Один и тот же адрес всегда даёт одну строку —
 * от регистра и лишних пробелов ответ не зависит.
 */

export function normalizeGeocodeQuery(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("ru-RU");
}

export function buildGeocodeQuery(input: {
  cityName: string;
  address?: string | null;
  districtName?: string | null;
}): string {
  const parts: string[] = [];
  const address = input.address?.trim() ?? "";
  if (address) {
    parts.push(address);
  }
  const district = input.districtName?.trim() ?? "";
  if (district) {
    const haystack = address.toLocaleLowerCase("ru-RU");
    if (!haystack.includes(district.toLocaleLowerCase("ru-RU"))) {
      parts.push(district);
    }
  }
  parts.push(input.cityName);
  return normalizeGeocodeQuery(parts.join(", "));
}

export function geocodeAccuracyNote(accuracy: string | null | undefined): string | null {
  if (accuracy === "DISTRICT" || accuracy === "district") {
    return "Точка района: точный адрес не распознан";
  }
  if (accuracy === "CITY" || accuracy === "city") {
    return "Точка центра города: точный адрес не распознан";
  }
  return null;
}
