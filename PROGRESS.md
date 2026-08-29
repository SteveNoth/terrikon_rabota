# PROGRESS — Террикон Работа

Последнее обновление: 2026-08-29

## Где я сейчас
- Текущий этап: 5
- Последний завершённый этап: 5
- Последний коммит: Этап 5 — слой данных, адаптеры и первые API (ветка `stage-05-data-layer`)
- Ветка этапа: `stage-05-data-layer`

## Что уже работает
- Установлены Node.js, Python, Git, Cursor
- Созданы аккаунты GitHub, Supabase, Vercel, Telegram
- Репозиторий terrikon_rabota на GitHub (логин: SteveNoth), привязан локально
- Скелет Next.js: TypeScript, ESLint, Tailwind CSS v4, `src/`, App Router, Turbopack
- Дизайн-система: токены в `src/styles/tokens.css`, режимы в `src/styles/modes.css`, кирпичики в `src/components/ui/`
- Живой стайлгайд: http://localhost:3000/dev/ui (только в разработке)
- `npm run check:design` проходит и ловит HEX вне токенов
- География из `shared/geo.json`: Горловка активна, Донецк/Макеевка/Енакиево/Харцызск — soon, остальные — planned
- Адреса `/gorlovka`, `/gorlovka/jobs`; `/` уводит на город по cookie `tr_city` или город по умолчанию
- `/donetsk` показывает заглушку с падежами; `/lugansk` — 404 со списком доступных городов
- Селектор города — форма GET (без JavaScript) и мгновенный переход с JavaScript
- Шапка, футер, нижнее меню; слот под кнопку поддержки проекта пока пустой
- Prisma 6.19.3: схема по разделу 10, миграция `init` накатана на Supabase, сиды 12 местных + 3 вахты, клиент `src/lib/adapters/db.ts`
- Слой данных `src/lib/repo/`: страницы просят функции, а не пишут Prisma-запросы. Список вакансий без `description`, всегда `take`. Вахты по умолчанию не смешиваются с местными (Закон 17)
- Адаптеры: кэш (память, задел под Redis), storage / search / notify / maps — шов по переменным окружения
- `/api/vacancies`: Горловка — 12 вакансий; Донецк — `cityInDevelopment: true`; несуществующий город — 404; кривые `page`/`sort` не ломают ответ
- `/api/ping` — 204; `/api/ping?size=8kb` — ровно 8192 байта несжимаемых данных
- Форматтеры: деньги, даты, телефон, склонения
- `npm run build` проходит
- Живой сайт: https://terrikon-rabota.vercel.app
- База Supabase: проект `terrikon-rabota`, регион Frankfurt (`eu-central-1`)
- Серверные функции Vercel: регион `fra1` (`vercel.json`), рядом с базой

## Технические факты проекта (ИИ, читай это!)
- Node.js: v24.20.0
- Next.js: 16.3.3
- Tailwind CSS: 4.3.3 (мажорная версия **4** — связка токенов через `@theme` в CSS, не через `tailwind.config.ts`)
- React: 19.2.8
- class-variance-authority: 0.7.1
- clsx: 2.1.1
- tailwind-merge: 3.6.0
- Prisma: 6.19.3 (не 7: URL в schema.prisma, клиент `@prisma/client`)
- zod: 3.25.76
- Пакетный менеджер: npm (v11.19.0)
- Python: 3.14.6
- Git: 2.55.0.windows.5
- ОС: Windows 10, оболочка PowerShell
- Имя репозитория GitHub: terrikon_rabota
- URL репозитория: https://github.com/SteveNoth/terrikon_rabota
- URL сайта на Vercel: https://terrikon-rabota.vercel.app
- Команда Vercel: terrikon
- Проект Vercel: terrikon-rabota
- Проект Supabase: terrikon-rabota (ref ptbtyfvszliqagnvpocf, регион eu-central-1)
- Регион Vercel: `fra1` (Франкфурт)
- Cookie города: `tr_city`
- Источник городов: `shared/geo.json` (читают и TypeScript, и Python)
- Prisma seed: `npx prisma db seed` (tsx prisma/seed.ts)
- Кэш списков вакансий: нет (только справочники и счётчики)
- Бюджет `/api/vacancies`: ≤ 400 мс, когда функция и база в одном регионе. С домашнего ПК до Франкфурта один `SELECT 1` уже ~500 мс — это дорога, не запрос.

## Решения, которые нельзя менять
- Стек выбран бесплатный (см. docs/DECISIONS.md)
- Tailwind CSS v4 (установлен create-next-app; Этап 2 делать в варианте для v4, не для v3)
- Города не пишутся строкой в `src/` — только через `shared/geo.json` (Закон 3)
- Prisma 6.x, не 7 (см. docs/DECISIONS.md)
- Серверные функции Vercel живут в `fra1`, рядом с Supabase (см. docs/DECISIONS.md)

## Открытые вопросы / долги
- GitHub ещё не подключён к проекту Vercel: `git push` пока сам сайт не обновляет. Нужно один раз связать репозиторий в панели Vercel (шаги в docs/SETUP-LOG.md). После связи регион `fra1` из `vercel.json` применится сам.
- Next.js 16 предупреждает, что `middleware.ts` устарел в пользу `proxy.ts`. Файл оставлен как `src/middleware.ts`, потому что так написано в ядре и на следующих этапах его дополняем.
