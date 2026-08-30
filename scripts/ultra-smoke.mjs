import { gzipSync } from "node:zlib";

const origin = "http://127.0.0.1:3000";
const paths = [
  "/gorlovka?mode=ultra",
  "/gorlovka/jobs?mode=ultra",
  "/gorlovka/map?mode=ultra",
  "/gorlovka/jobs?q=сварщик&mode=ultra",
  "/donetsk?mode=ultra",
  "/about/lite?mode=ultra",
  "/about?mode=ultra",
  "/lugansk?mode=ultra",
  "/safety?mode=ultra",
  "/gorlovka?mode=full",
];

async function check(path) {
  const res = await fetch(origin + path, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  const html = buf.toString("utf8");
  const h1 = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || ["", ""])[1].replace(/<[^>]+>/g, "").trim();
  const job = html.match(/href="(\/gorlovka\/job\/[^"]+)"/);
  return {
    path,
    status: res.status,
    gz: +(gzipSync(buf).length / 1024).toFixed(2),
    scripts: (html.match(/<script/g) || []).length,
    next: html.includes("/_next/"),
    h1,
    original: html.includes("Показать оригинал"),
    full: html.includes("Полная версия"),
    eco: html.includes("Экономная версия"),
    jobHref: job ? job[1] : null,
  };
}

const rows = [];
for (const path of paths) {
  rows.push(await check(path));
}
const jobHref = rows.find((row) => row.jobHref)?.jobHref;
if (jobHref) {
  rows.push(await check(`${jobHref}?mode=ultra`));
}
console.log(JSON.stringify(rows, null, 2));
