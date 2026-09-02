"use server";

import { redirect } from "next/navigation";
import { log } from "@/lib/log";
import { isSelectableCity } from "@/lib/geo";

export async function notifyCityOpen(formData: FormData) {
  const city = String(formData.get("city") ?? "");
  log.info("notify-city-open", "заявка на открытие города", { city });

  if (isSelectableCity(city)) {
    redirect(`/${city}?notified=1`);
  }
}
