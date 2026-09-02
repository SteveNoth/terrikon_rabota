import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { cityName, isCitySlug } from "@/lib/geo";
import { SITE_NAME } from "@/lib/seo/brand";
import { formatMoney } from "@/lib/format/money";
import { getVacancyBySlug } from "@/lib/repo/vacancies";

export const OG_SIZE = { width: 800, height: 420 };
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT = `${SITE_NAME} — вакансия`;

function readTokensCss(): string {
  return readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
}

function loadTokens(): Map<string, string> {
  const css = readTokensCss();
  const palette = new Map<string, string>();
  for (const match of css.matchAll(/--p-([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    palette.set(`--p-${match[1]}`, match[2]!);
  }
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/--t-color-([a-z0-9-]+):\s*var\((--p-[a-z0-9-]+)\)/g)) {
    const hex = palette.get(match[2]!);
    if (hex) {
      tokens.set(`--t-color-${match[1]}`, hex);
    }
  }
  return tokens;
}

function tokenOf(tokens: Map<string, string>, name: string, fallback: string): string {
  return tokens.get(name) ?? fallback;
}

function wrapLine(text: string, max = 42): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 3);
}

function cityLine(citySlug: string, isVahta: boolean, workLocation: string | null): string {
  if (isVahta && workLocation) {
    return `Вахта · ${workLocation}`;
  }
  if (isCitySlug(citySlug)) {
    return `Работа в ${cityName(citySlug, "loc")}`;
  }
  return citySlug;
}

export async function vacancyOgImage(params: { city: string; slug: string }): Promise<ImageResponse> {
  const tokens = loadTokens();
  const record = await getVacancyBySlug(params.slug, { allowClosed: true });
  const title = record && record.citySlug === params.city ? record.title : "Вакансия";
  const salary = record
    ? formatMoney({
        salaryFrom: record.salaryFrom,
        salaryTo: record.salaryTo,
        salaryPeriod: record.salaryPeriod,
      })
    : "";
  const place = record
    ? cityLine(record.citySlug, record.workFormat === "VAHTA", record.workLocationText)
    : SITE_NAME;
  const titleLines = wrapLine(title);

  const brand = tokenOf(tokens, "--t-color-brand", "#1e3a5f");
  const accent = tokenOf(tokens, "--t-color-accent", "#f4a261");
  const inverse = tokenOf(tokens, "--t-color-text-inverse", "#ffffff");

  return new ImageResponse(
    (
      <div
        style={{
          width: "800px",
          height: "420px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "40px 48px",
          backgroundColor: brand,
          color: inverse,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ fontSize: "22px", color: accent, fontWeight: 600 }}>{SITE_NAME}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {titleLines.map((line) => (
              <div key={line} style={{ fontSize: "40px", fontWeight: 600, lineHeight: 1.15 }}>
                {line}
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {salary ? (
            <div style={{ fontSize: "32px", fontWeight: 600, color: accent }}>{salary}</div>
          ) : null}
          <div style={{ fontSize: "24px" }}>{place}</div>
        </div>
      </div>
    ),
    OG_SIZE,
  );
}

export async function defaultOgImage(): Promise<ImageResponse> {
  const tokens = loadTokens();
  const brand = tokenOf(tokens, "--t-color-brand", "#1e3a5f");
  const accent = tokenOf(tokens, "--t-color-accent", "#f4a261");
  const inverse = tokenOf(tokens, "--t-color-text-inverse", "#ffffff");

  return new ImageResponse(
    (
      <div
        style={{
          width: "800px",
          height: "420px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px",
          backgroundColor: brand,
          color: inverse,
        }}
      >
        <div style={{ fontSize: "28px", color: accent, fontWeight: 600 }}>Региональный агрегатор</div>
        <div style={{ fontSize: "52px", fontWeight: 600, marginTop: "12px" }}>{SITE_NAME}</div>
        <div style={{ fontSize: "26px", marginTop: "16px" }}>Свежие вакансии без платы за контакты</div>
      </div>
    ),
    OG_SIZE,
  );
}
