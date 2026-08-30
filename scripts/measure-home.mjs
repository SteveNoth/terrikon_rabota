import { gzipSync } from "node:zlib";

const origin = process.env.MEASURE_ORIGIN || "http://127.0.0.1:3002";
const modes = ["full", "lite", "ultra"];

function parseAssets(html, base) {
  const urls = new Set();

  const add = (raw) => {
    if (
      !raw ||
      raw.startsWith("data:") ||
      raw.startsWith("mailto:") ||
      raw.startsWith("tel:") ||
      raw.startsWith("#")
    ) {
      return;
    }
    const clean = raw.split("#")[0];
    if (!clean) {
      return;
    }
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      if (clean.startsWith(origin)) {
        urls.add(clean);
      }
      return;
    }
    urls.add(new URL(clean, base).href);
  };

  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tag.match(/\brel="([^"]+)"/i)?.[1] ?? "";
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    if (
      /\bstylesheet\b/i.test(rel) ||
      /\bpreload\b/i.test(rel) ||
      /\bmodulepreload\b/i.test(rel) ||
      /\bicon\b/i.test(rel)
    ) {
      add(href);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    add(match[1]);
  }
  for (const match of html.matchAll(/<use\b[^>]*\bhref="([^"]+)"/gi)) {
    add(match[1]);
  }

  return [...urls];
}

async function fetchBin(url) {
  const res = await fetch(url, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, buf, type: res.headers.get("content-type") || "" };
}

function classify(url, type) {
  if (type.includes("text/css") || url.endsWith(".css")) return "css";
  if (type.includes("javascript") || url.endsWith(".js")) return "js";
  if (type.includes("font") || url.includes(".woff")) return "font";
  if (type.includes("image") || url.includes("/icons/") || /\.(svg|png|jpe?g|webp|avif)(\?|$)/i.test(url)) {
    return "image";
  }
  return "other";
}

async function measure(mode) {
  const pageUrl = `${origin}/gorlovka?mode=${mode}`;
  const htmlRes = await fetchBin(pageUrl);
  const html = htmlRes.buf.toString("utf8");
  const buckets = {
    html: gzipSync(htmlRes.buf).length,
    css: 0,
    js: 0,
    image: 0,
    font: 0,
    other: 0,
  };
  let requests = 1;
  const files = [];
  for (const url of parseAssets(html, pageUrl)) {
    if (!url.startsWith(origin)) continue;
    requests += 1;
    const res = await fetchBin(url);
    const gz = gzipSync(res.buf).length;
    const kind = classify(url, res.type);
    buckets[kind] += gz;
    files.push({
      url: url.replace(origin, ""),
      kind,
      gzKb: +(gz / 1024).toFixed(2),
      status: res.status,
    });
  }
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
  const dataMode = html.match(/data-mode="([a-z]+)"/)?.[1] ?? "";
  const vacancyTitles = [...html.matchAll(/<h3 class="break-words font-medium text-lg leading-tight">([^<]+)<\/h3>/g)].map(
    (row) => row[1],
  );
  return {
    mode,
    dataMode,
    title,
    totalKb: +(Object.values(buckets).reduce((a, b) => a + b, 0) / 1024).toFixed(1),
    htmlKb: +(buckets.html / 1024).toFixed(1),
    cssKb: +(buckets.css / 1024).toFixed(1),
    jsKb: +(buckets.js / 1024).toFixed(1),
    imageKb: +(buckets.image / 1024).toFixed(1),
    fontKb: +(buckets.font / 1024).toFixed(1),
    otherKb: +(buckets.other / 1024).toFixed(1),
    requests,
    sprite: files.some((file) => file.url.includes("sprite.svg")),
    imgTags: (html.match(/<img\b/gi) || []).length,
    woff: html.includes("woff"),
    cards: vacancyTitles.length,
    titles: vacancyTitles,
    hasPreview: html.includes("line-clamp-2"),
    files,
  };
}

const rows = [];
for (const mode of modes) {
  rows.push(await measure(mode));
}
console.log(JSON.stringify(rows, null, 2));
