/**
 * Иконки PWA из SVG без тяжёлых библиотек.
 *
 * Как это работает:
 * 1. Источник — public/icons/app.svg (тот же террикон, что в шапке, с цветами бренда).
 * 2. Скрипт читает пути и кружок, рисует их на сетке пикселей (сканлайн для заливки,
 *    круги вдоль линии для обводки) и записывает обычный PNG через zlib.
 * 3. Результат: icon-192, icon-512, maskable 512 (с полями, чтобы Android не обрезал
 *    террикон) и apple-touch-icon 180. Файлы лежат в git, сборка сайта их не считает.
 *
 * Пересобрать: node scripts/generate-pwa-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SVG_PATH = join(ROOT, "public", "icons", "app.svg");
const OUT_DIR = join(ROOT, "public", "icons");
const VIEW = 32;

function crcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC = crcTable();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const payload = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(payload), 0);
  return Buffer.concat([len, payload, crc]);
}

function encodePng(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    const src = y * width * 4;
    pixels.copy(raw, row + 1, src, src + width * 4);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

function parseColor(hex, alpha = 255) {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
    alpha,
  ];
}

function parsePath(d) {
  const tokens = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+/g) ?? [];
  const pts = [];
  let i = 0;
  let x = 0;
  let y = 0;
  let cmd = "L";
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[MmLlHhVvZz]$/.test(t)) {
      cmd = t;
      i += 1;
      if (cmd === "Z" || cmd === "z") {
        continue;
      }
    }
    if (cmd === "M" || cmd === "L") {
      x = Number(tokens[i]);
      y = Number(tokens[i + 1]);
      pts.push({ x, y });
      i += 2;
      cmd = "L";
    } else if (cmd === "m" || cmd === "l") {
      x += Number(tokens[i]);
      y += Number(tokens[i + 1]);
      pts.push({ x, y });
      i += 2;
      cmd = "l";
    } else if (cmd === "H") {
      x = Number(tokens[i]);
      pts.push({ x, y });
      i += 1;
    } else if (cmd === "h") {
      x += Number(tokens[i]);
      pts.push({ x, y });
      i += 1;
    } else {
      i += 1;
    }
  }
  return pts;
}

function setPixel(pixels, w, h, x, y, color) {
  if (x < 0 || y < 0 || x >= w || y >= h) {
    return;
  }
  const i = (y * w + x) * 4;
  const srcA = color[3] / 255;
  const dstA = pixels[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) {
    return;
  }
  const mix = (src, dst) => Math.round((src * srcA + dst * dstA * (1 - srcA)) / outA);
  pixels[i] = mix(color[0], pixels[i]);
  pixels[i + 1] = mix(color[1], pixels[i + 1]);
  pixels[i + 2] = mix(color[2], pixels[i + 2]);
  pixels[i + 3] = Math.round(outA * 255);
}

function fillPoly(pixels, w, h, pts, color) {
  if (pts.length < 3) {
    return;
  }
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
  for (let y = minY; y <= maxY; y += 1) {
    const xs = [];
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y || 1);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.floor(xs[i]));
      const x1 = Math.min(w - 1, Math.ceil(xs[i + 1]));
      for (let x = x0; x <= x1; x += 1) {
        setPixel(pixels, w, h, x, y, color);
      }
    }
  }
}

function fillCircle(pixels, w, h, cx, cy, r, color) {
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(w - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(pixels, w, h, x, y, color);
      }
    }
  }
}

function strokePoly(pixels, w, h, pts, width, color, closed) {
  const list = closed && pts.length > 0 ? [...pts, pts[0]] : pts;
  for (let i = 0; i + 1 < list.length; i += 1) {
    const a = list[i];
    const b = list[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const steps = Math.ceil(len);
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      fillCircle(pixels, w, h, a.x + dx * t, a.y + dy * t, width / 2, color);
    }
  }
}

function mapPts(pts, scale, ox, oy) {
  return pts.map((p) => ({ x: ox + p.x * scale, y: oy + p.y * scale }));
}

function renderIcon(size, padRatio) {
  const svg = readFileSync(SVG_PATH, "utf8");
  const bg = parseColor(svg.match(/rect[^>]*fill="(#[0-9a-fA-F]+)"/)?.[1] ?? "#1e3a5f");
  const fill = parseColor("#ffffff", Math.round(0.3 * 255));
  const stroke = parseColor("#ffffff");
  const sun = parseColor(svg.match(/circle[^>]*fill="(#[0-9a-fA-F]+)"/)?.[1] ?? "#f4a261");
  const paths = [...svg.matchAll(/<path[^>]*d="([^"]+)"[^>]*>/g)].map((m) => ({
    d: m[1],
    tag: m[0],
  }));
  const pad = size * padRatio;
  const inner = size - pad * 2;
  const scale = inner / VIEW;
  const ox = pad;
  const oy = pad;

  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    pixels[i * 4] = bg[0];
    pixels[i * 4 + 1] = bg[1];
    pixels[i * 4 + 2] = bg[2];
    pixels[i * 4 + 3] = 255;
  }

  const rx = 6 * scale;
  if (padRatio > 0.08) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const inX = x >= pad - 1 && x < size - pad + 1;
        const inY = y >= pad - 1 && y < size - pad + 1;
        if (!inX || !inY) {
          pixels[(y * size + x) * 4 + 3] = 255;
        }
      }
    }
  }

  void rx;

  for (const path of paths) {
    const pts = mapPts(parsePath(path.d), scale, ox, oy);
    const isStroke = path.tag.includes("stroke=");
    const sw = Number(path.tag.match(/stroke-width="([\d.]+)"/)?.[1] ?? 1.8) * scale;
    if (isStroke) {
      const closed = /Z/i.test(path.d);
      strokePoly(pixels, size, size, pts, sw, stroke, closed);
    } else {
      fillPoly(pixels, size, size, pts, fill);
    }
  }

  const circle = svg.match(/<circle[^>]*cx="([\d.]+)"[^>]*cy="([\d.]+)"[^>]*r="([\d.]+)"/);
  if (circle) {
    fillCircle(
      pixels,
      size,
      size,
      ox + Number(circle[1]) * scale,
      oy + Number(circle[2]) * scale,
      Number(circle[3]) * scale,
      sun,
    );
  }

  return encodePng(size, size, pixels);
}

const outputs = [
  { file: "icon-192.png", size: 192, pad: 0.08 },
  { file: "icon-512.png", size: 512, pad: 0.08 },
  { file: "icon-512-maskable.png", size: 512, pad: 0.2 },
  { file: "apple-touch-icon.png", size: 180, pad: 0.08 },
];

for (const item of outputs) {
  const png = renderIcon(item.size, item.pad);
  const dest = join(OUT_DIR, item.file);
  writeFileSync(dest, png);
  console.log(`wrote ${item.file} (${png.length} bytes)`);
}
