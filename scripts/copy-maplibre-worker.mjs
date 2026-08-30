/**
 * MapLibre 6 держит воркер отдельным файлом. Turbopack не умеет
 * `new URL(..., import.meta.url)` внутри пакета, поэтому кладём
 * worker, shared и CSS в public/ — браузер грузит их только когда карту открыли.
 * CSS тоже копируем, а не импортируем в бандл: иначе стили карты попали бы
 * в первую загрузку главной.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fromDir = join(root, "node_modules", "maplibre-gl", "dist");
const toDir = join(root, "public", "maplibre");

mkdirSync(toDir, { recursive: true });
for (const name of [
  "maplibre-gl.mjs",
  "maplibre-gl-worker.mjs",
  "maplibre-gl-shared.mjs",
  "maplibre-gl.css",
]) {
  copyFileSync(join(fromDir, name), join(toDir, name));
}

console.log("Скопированы MapLibre ESM, worker и CSS в public/maplibre/");
