/**
 * Service worker «Террикон Работа».
 *
 * На пальцах: это маленькая программа, которую браузер держит отдельно от
 * вкладки. Она перехватывает запросы («открой /gorlovka/jobs») и может
 * ответить из своей коробки (кэша), даже когда интернета нет.
 *
 * Почему это «страшно»: если один раз закэшировать ошибку или старую страницу,
 * человек может видеть её неделями — сайт «обновили», а у него в метро всё ещё
 * вчерашний список. Классика: закэшировали 500-ю страницу, сервер починили,
 * кэш продолжает отдавать «не получилось».
 *
 * Как защищаемся:
 * 1. CACHE_VERSION — имя коробки. Новая версия SW = новые имена кэшей.
 *    При activate старые коробки удаляются целиком.
 * 2. В кэш кладём только успешные ответы (status 200). Ошибки и 404 — нет.
 * 3. HTML и данные вакансий — сначала сеть. Кэш только если сеть не ответила.
 *    Онлайн человек не сидит на вечно старой странице.
 * 4. Статика с хешем в имени (/_next/static/...) — сначала кэш, в фоне
 *    подтягиваем свежее: файлы и так уникальны, путаницы нет.
 * 5. Админку, вход, API парсера, события, жалобы, очередь офлайна и /api/ping
 *    не кэшируем никогда.
 * 6. Когда выложили новую версию, SW ждёт кнопку «Обновить приложение»,
 *    а не подменяет страницу посреди чтения.
 */

const CACHE_VERSION = "tr-offline-v1";
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;

const PRECACHE = [
  "/offline",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/app.svg",
];

const NEVER_CACHE_PREFIXES = [
  "/admin",
  "/login",
  "/api/auth",
  "/api/parser",
  "/api/offline",
  "/api/events",
  "/api/reports",
  "/api/ping",
  "/dev",
];

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" && request.method !== "HEAD") {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isNeverCache(url.pathname)) {
    return;
  }

  if (isRscRequest(request, url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (isShellAsset(url.pathname)) {
    event.respondWith(cacheFirstUpdate(request, SHELL_CACHE));
    return;
  }

  if (request.mode === "navigate" || isDocument(request)) {
    event.respondWith(networkFirst(request, DATA_CACHE, true));
    return;
  }

  if (isVacancyData(url.pathname)) {
    event.respondWith(networkFirst(request, DATA_CACHE, false));
    return;
  }
});

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    PRECACHE.map(async (path) => {
      try {
        const response = await fetch(path, { cache: "reload" });
        if (isCacheable(response)) {
          await cache.put(path, response);
        }
      } catch {
        // Первая установка без сети не должна ронять SW.
      }
    }),
  );
}

function isNeverCache(pathname) {
  return NEVER_CACHE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isRscRequest(request, url) {
  if (url.searchParams.has("_rsc")) {
    return true;
  }
  if (request.headers.get("RSC") === "1") {
    return true;
  }
  if (request.headers.get("Next-Router-Prefetch") === "1") {
    return true;
  }
  return false;
}

function isShellAsset(pathname) {
  if (pathname.startsWith("/_next/static/")) {
    return true;
  }
  if (pathname.startsWith("/icons/")) {
    return true;
  }
  if (pathname.startsWith("/fonts/")) {
    return true;
  }
  if (pathname === "/manifest.webmanifest" || pathname === "/favicon.ico") {
    return true;
  }
  return /\.(?:js|css|woff2|svg|png|webp|ico)$/.test(pathname);
}

function isDocument(request) {
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function isVacancyData(pathname) {
  return pathname === "/api/vacancies" || pathname.startsWith("/api/vacancies/");
}

function isCacheable(response) {
  if (!response || response.status !== 200 || response.type === "opaque") {
    return false;
  }
  if (response.headers.get("Content-Range")) {
    return false;
  }
  return true;
}

async function cacheFirstUpdate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((response) => {
      if (isCacheable(response)) {
        void cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetching;
}

async function networkFirst(request, cacheName, isNavigation) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (isNavigation) {
      const offline = await caches.match("/offline");
      if (offline) {
        return offline;
      }
    }
    throw error;
  }
}

async function networkOnly(request) {
  return fetch(request);
}
