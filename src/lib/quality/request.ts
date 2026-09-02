import { headers } from "next/headers";
import { FEATURES } from "@/lib/quality/features";
import { defaultQualityMode } from "@/lib/quality/server";
import {
  isQualityMode,
  MODE_HEADER,
  type QualityFeatures,
  type QualityMode,
} from "@/lib/quality/types";

export type RequestQuality = {
  mode: QualityMode;
  features: QualityFeatures;
};

/** Режим, который middleware уже посчитал и положил в заголовок — до HTML. */
export async function getRequestQuality(): Promise<RequestQuality> {
  const modeHeader = (await headers()).get(MODE_HEADER);
  const mode = isQualityMode(modeHeader) ? modeHeader : defaultQualityMode();
  return { mode, features: FEATURES[mode] };
}
