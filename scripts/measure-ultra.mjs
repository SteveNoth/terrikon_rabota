import { gzipSync } from "node:zlib";

const origin = process.env.MEASURE_ORIGIN ?? "http://127.0.0.1:3000";
const pages = [
  { name: "home", path: "/gorlovka?mode=ultra" },
  { name: "jobs", path: "/gorlovka/jobs?mode=ultra" },
];

const BITRATE = 50_000;
const LATENCY_S = 1.2;

function parseAssets(html, base) {
  const urls = new Set();
  const add = (raw) => {
    if (!raw || raw.startsWith("data:") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("#")) {
      return;
    }
    const clean = raw.split("#")[0];
    if (!clean) return;
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      if (clean.startsWith(origin)) urls.add(clean);
      return;
    }
    urls.add(new URL(clean, base).href);
  };
  for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) add(match[1]);
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = tag.match(/\brel="([^"]+)"/i)?.[1] ?? "";
    const href = tag.match(/\bhref="([^"]+)"/i)?.[1];
    if (!href) continue;
    if (/\bstylesheet\b/i.test(rel) || /\bpreload\b/i.test(rel) || /\bmodulepreload\b/i.test(rel) || /\bicon\b/i.test(rel)) {
      add(href);
    }
  }
  for (const match of html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) add(match[1]);
  return [...urls];
}

async function fetchBin(url) {
  const res = await fetch(url, { redirect: "follow", headers: { "Accept-Encoding": "gzip, deflate, br" } });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    buf,
    type: res.headers.get("content-type") || "",
    encoding: res.headers.get("content-encoding") || "",
    cache: res.headers.get("cache-control") || "",
  };
}

function transferSeconds(bytes) {
  return LATENCY_S + (bytes * 8) / BITRATE;
}

async function measure(name, path) {
  const pageUrl = `${origin}${path}`;
  const htmlRes = await fetchBin(pageUrl);
  const html = htmlRes.buf.toString("utf8");
  const htmlGz = gzipSync(htmlRes.buf).length;
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
  const cssBytes = Buffer.byteLength(style, "utf8");
  const cssGz = gzipSync(Buffer.from(style)).length;
  const scriptsSrc = [...html.matchAll(/<script\b[^>]*\bsrc=/gi)].length;
  const scriptsInline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>/gi)].length;
  const hasModule = html.includes("modulepreload") || html.includes("/_next/");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = h1 ? h1[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
  const firstCard = html.indexOf("<h3>");
  const untilCard = firstCard >= 0 ? html.slice(0, firstCard + 4) : html.slice(0, Math.min(html.length, 4000));
  const untilCardGz = gzipSync(Buffer.from(untilCard)).length;

  let extra = 0;
  let requests = 1;
  for (const url of parseAssets(html, pageUrl)) {
    if (!url.startsWith(origin)) continue;
    requests += 1;
    const res = await fetchBin(url);
    extra += gzipSync(res.buf).length;
  }

  const totalGz = htmlGz + extra;
  return {
    name,
    status: htmlRes.status,
    encoding: htmlRes.encoding || "(тело уже разжато fetch; gzip считаем сами)",
    cache: htmlRes.cache,
    title,
    htmlKb: +(htmlGz / 1024).toFixed(2),
    cssUncompressedKb: +(cssBytes / 1024).toFixed(2),
    cssGzKb: +(cssGz / 1024).toFixed(2),
    jsSrc: scriptsSrc,
    jsInline: scriptsInline,
    nextRuntime: hasModule,
    requests,
    extraKb: +(extra / 1024).toFixed(2),
    totalKb: +(totalGz / 1024).toFixed(2),
    seconds50kFull: +transferSeconds(totalGz).toFixed(2),
    seconds50kToCard: +transferSeconds(untilCardGz).toFixed(2),
    budgets: {
      total40: totalGz <= 40 * 1024,
      html25: htmlGz <= 25 * 1024,
      css8: cssBytes <= 8 * 1024,
      js0: scriptsSrc === 0 && scriptsInline === 0 && !hasModule,
      req3: requests <= 3,
    },
  };
}

const rows = [];
for (const page of pages) {
  rows.push(await measure(page.name, page.path));
}
console.log(JSON.stringify(rows, null, 2));

const failed = rows.filter(
  (row) => !row.budgets.total40 || !row.budgets.js0 || !row.budgets.req3 || !row.budgets.css8,
);
if (failed.length > 0) {
  console.error("Ultra budget failed:", failed.map((row) => row.name).join(", "));
  process.exit(1);
}
