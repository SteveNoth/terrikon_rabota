# PROGRESS — Террикон Работа

Последнее обновление: 2026-08-28

## Где я сейчас
- Текущий этап: 1 (завершён, осталось руками подключить GitHub в Vercel — см. docs/SETUP-LOG.md)
- Последний завершённый этап: 1
- Последний коммит: 60d5553 — «Этап 1: скелет Next.js и заглушка главной страницы»

## Что уже работает
- Установлены Node.js, Python, Git, Cursor
- Созданы аккаунты GitHub, Supabase, Vercel, Telegram
- Репозиторий terrikon_rabota на GitHub (логин: SteveNoth), привязан локально
- Скелет Next.js: TypeScript, ESLint, Tailwind CSS v4, `src/`, App Router, Turbopack
- Главная страница — текстовая заглушка
- `npm run dev` открывает http://localhost:3000
- `npm run build` проходит без ошибок
- Живой сайт: https://terrikon-rabota.vercel.app

## Технические факты проекта (ИИ, читай это!)
- Node.js: v24.20.0
- Next.js: 16.3.3
- Tailwind CSS: 4.3.3 (мажорная версия **4** — от неё зависит весь Этап 2)
- React: 19.2.8
- Prisma: —
- Пакетный менеджер: npm (v11.19.0)
- Python: 3.14.6
- Git: 2.55.0.windows.5
- ОС: Windows 10, оболочка PowerShell
- Имя репозитория GitHub: terrikon_rabota
- URL репозитория: https://github.com/SteveNoth/terrikon_rabota
- URL сайта на Vercel: https://terrikon-rabota.vercel.app
- Команда Vercel: terrikon
- Проект Vercel: terrikon-rabota
- Проект Supabase: —

## Решения, которые нельзя менять
- Стек выбран бесплатный (см. docs/DECISIONS.md)
- Tailwind CSS v4 (установлен create-next-app; Этап 2 делать в варианте для v4, не для v3)

## Открытые вопросы / долги
- GitHub ещё не подключён к проекту Vercel: `git push` пока сам сайт не обновляет. Нужно один раз связать репозиторий в панели Vercel (шаги в docs/SETUP-LOG.md).
