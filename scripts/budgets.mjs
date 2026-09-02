/**
 * Бюджеты первой загрузки из раздела 8.5 ядра (КБ, gzip).
 * Страница проверки: /gorlovka/jobs, кэш пустой.
 */
export const BUDGET_KB = {
  full: { total: 600, html: 60, css: 40, js: 220, images: 300, fonts: 40, requests: 25 },
  lite: { total: 180, html: 40, css: 15, js: 90, images: 60, fonts: 0, requests: 12 },
  ultra: { total: 40, html: 25, css: 8, js: 0, images: 0, fonts: 0, requests: 3 },
};

/** Пакеты, которые сразу выносят Lite/Ultra. MapLibre живёт в public/, не в импорте Next. */
export const BANNED_IMPORTS = [
  "lodash",
  "lodash-es",
  "moment",
  "moment-timezone",
  "recharts",
  "chart.js",
  "chartjs",
  "jquery",
  "maplibre-gl",
];

export const BANNED_DEPENDENCIES = [
  "lodash",
  "lodash-es",
  "moment",
  "moment-timezone",
  "recharts",
  "chart.js",
  "jquery",
];
