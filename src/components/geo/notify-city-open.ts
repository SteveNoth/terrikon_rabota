"use server";

import { redirect } from "next/navigation";
import { isSelectableCity } from "@/lib/geo";

export async function notifyCityOpen(formData: FormData) {
  const city = String(formData.get("city") ?? "");
  const contact = String(formData.get("contact") ?? "").trim();
  console.log("[notify-city-open]", { city, contact });

  if (isSelectableCity(city)) {
    redirect(`/${city}?notified=1`);
  }
}
