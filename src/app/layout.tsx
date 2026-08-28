import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ModeProvider, type QualityMode } from "@/components/ui/mode-provider";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Террикон Работа",
  description: "Региональный агрегатор вакансий",
};

function isQualityMode(value: string | undefined): value is QualityMode {
  return value === "full" || value === "lite" || value === "ultra";
}

async function readQualityMode(): Promise<QualityMode> {
  const jar = await cookies();
  const fromCookie = jar.get("tr_mode")?.value;
  if (isQualityMode(fromCookie)) {
    return fromCookie;
  }

  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_QUALITY_MODE;
  if (isQualityMode(fromEnv)) {
    return fromEnv;
  }

  return "lite";
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const mode = await readQualityMode();

  return (
    <html lang="ru" data-mode={mode} data-theme="light" suppressHydrationWarning>
      <body>
        <ModeProvider initialMode={mode}>{children}</ModeProvider>
      </body>
    </html>
  );
}
