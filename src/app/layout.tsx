import type { Metadata } from "next";
import { headers } from "next/headers";
import { ModeProvider } from "@/components/ui/mode-provider";
import { QualityProvider } from "@/lib/quality/QualityProvider";
import { FEATURES } from "@/lib/quality/features";
import { defaultQualityMode } from "@/lib/quality/server";
import {
  isQualityMode,
  isQualityPreference,
  MODE_HEADER,
  PREFERENCE_HEADER,
} from "@/lib/quality/types";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Террикон Работа",
  description: "Региональный агрегатор вакансий",
};

async function readQuality() {
  const jar = await headers();
  const modeHeader = jar.get(MODE_HEADER);
  const preferenceHeader = jar.get(PREFERENCE_HEADER);

  return {
    mode: isQualityMode(modeHeader) ? modeHeader : defaultQualityMode(),
    preference: isQualityPreference(preferenceHeader) ? preferenceHeader : "auto",
  };
}

/**
 * Брендовый шрифт подключается только если матрица это разрешила.
 * Lite/Ultra сюда не заходят: features.brandFont === false — в HTML нет ссылки на woff2.
 */
function BrandFont({ enabled }: { enabled: boolean }) {
  if (!enabled) {
    return null;
  }

  return <link rel="stylesheet" href="/fonts/brand.css" precedence="default" />;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { mode, preference } = await readQuality();
  const features = FEATURES[mode];

  return (
    <html lang="ru" data-mode={mode} data-theme="light" suppressHydrationWarning>
      {/* data-mode на <html>, не на <body>: modes.css и все токены читаются от корня документа. */}
      <body>
        <BrandFont enabled={features.brandFont} />
        <QualityProvider initialMode={mode} preference={preference}>
          <ModeProvider>{children}</ModeProvider>
        </QualityProvider>
      </body>
    </html>
  );
}
