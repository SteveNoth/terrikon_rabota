# Журнал ручных настроек — Террикон Работа

Сюда записываем всё, что делаем руками в чужих интерфейсах (GitHub, Supabase, Vercel и т.д.).
Чтобы через полгода можно было повторить.

Формат записи: дата → что сделали → зачем.

---

## 2026-08-28 — Аккаунты (заполни после создания!)

| Сервис   | Статус      | Дата       | Примечание |
|----------|-------------|------------|------------|
| GitHub   | ☑ создан    | 2026-08-28 | логин: SteveNoth |
| Supabase | ☑ создан    | 2026-08-28 | вход через GitHub |
| Vercel   | ☑ создан    | 2026-08-28 | вход через GitHub |
| Telegram | ☑ создан    | 2026-08-28 | для будущего бота |

## 2026-08-28 — Git на этом компьютере

- Папка проекта: `C:\Users\Max\Desktop\TERRICON JOB\Project`
- Репозиторий git инициализирован локально (ветка `master`)
- Первый коммит: `e002a1e` — «Этап 0: подготовка проекта»
- Репозиторий на GitHub: ☑ создан — https://github.com/SteveNoth/terrikon_rabota
- ⚠️ Имя на GitHub: `terrikon_rabota` (подчёркивание). В git было `terrikon-rabota` (дефис) — из-за этого push не работал.

## 2026-08-28 — Версии программ (проверено)

```
node -v          → v24.20.0
npm -v           → 11.19.0
python --version → Python 3.14.6
git --version    → git version 2.55.0.windows.5
```

## 2026-08-28 — Этап 1: скелет Next.js

- Команда: `npx create-next-app@latest terrikon-rabota` (файлы перенесены в корень репозитория, чтобы сайт и `docs/` жили вместе)
- Next.js: 16.3.3
- Tailwind CSS: 4.3.3 (мажорная версия 4)
- React: 19.2.8
- Ветка этапа: `stage-01-skeleton`
- `.env.local` есть на диске и в `.gitignore` (в GitHub не попадает)
- `.env.example` — список переменных без секретов, попадает в git

## 2026-08-28 — Этап 1: деплой на Vercel

- Команда Vercel: `terrikon` (вход через аккаунт `stevenoth` / GitHub SteveNoth)
- Проект Vercel: `terrikon-rabota`
- Адрес сайта: https://terrikon-rabota.vercel.app
- Деплой сделан через Vercel CLI (`npx vercel --yes --prod`) из папки проекта
- Репозиторий: https://github.com/SteveNoth/terrikon_rabota
- Production-ветка GitHub: `master`
- Переменные окружения на первом деплое: не задавали (страница-заглушка их не читает)
- Где потом вводить переменные: Vercel → проект `terrikon-rabota` → Settings → Environment Variables. Для первого деплоя не нужны.
- ⚠️ GitHub-репозиторий пока не привязан к проекту Vercel (ошибка `Failed to connect SteveNoth/terrikon_rabota`). Из-за этого `git push` сам сайт ещё не обновляет. Что нажать руками:
  1. Открыть https://vercel.com/terrikon/terrikon-rabota/settings/git
  2. Нажать **Connect Git Repository** (подключить git-репозиторий)
  3. Если Vercel попросит доступ к GitHub — **Install** / **Authorize** приложение Vercel для аккаунта SteveNoth
  4. Выбрать репозиторий `SteveNoth/terrikon_rabota`
  5. Ветка для продакшена (живой сайт): `master`
  6. После этого каждый `git push` в `master` сам пересоберёт https://terrikon-rabota.vercel.app

## 2026-08-29 — Этап 4: проект Supabase и строки подключения

Проект базы ещё не создан руками — ниже точная инструкция. Когда сделаешь шаги, допиши в эту же секцию: имя проекта, регион, дату.

### Зачем два адреса (пул и прямой)

Представь кассу в магазине.

- **Пул (pooled, порт 6543)** — общая очередь. Сайт на Vercel на каждый запрос страницы открывает соединение с базой и сразу закрывает. Если каждый посетитель займёт «свою кассу навсегда», касс не хватит (на бесплатном тарифе их мало). Пул выдаёт кассу на секунду и забирает обратно. Это `DATABASE_URL`.
- **Прямое / сессионное (direct / session, порт 5432)** — выделенная касса надолго. Миграция (смена таблиц) — это длинный разговор: «создай таблицу, потом индекс, потом связь». Пул такой разговор обрывает. Это `DIRECT_URL`.

Сайт в работе → пул. Смена схемы и сиды → прямое соединение.

### Регион: Frankfurt (Central EU, `eu-central-1`)

Ближайший к Донбассу и к часовому поясу UTC+3 из тех, что даёт Supabase. Стокгольм чуть севернее, Ирландия западнее, США — плюс 100–200 мс на каждый запрос. На бесплатном тарифе лишняя задержка сразу заметна.

Если в списке нет Frankfurt — бери **West EU (Ireland)** или **North EU (Stockholm)**. Не бери US/Asia.

### Создать проект

1. Открыть https://supabase.com/dashboard и войти через GitHub (аккаунт уже есть, Этап 0).
2. **New project**.
3. Organization — своя (часто называется как GitHub-логин).
4. **Project name:** `terrikon-rabota` (как репозиторий и Vercel).
5. **Database password:** нажать Generate, **скопировать в надёжное место**. Этот пароль больше не покажут. Он будет внутри строк подключения.
6. **Region:** `Frankfurt` / `Central EU` / `eu-central-1`.
7. Тариф **Free**. Create project. Подождать 1–2 минуты, пока база поднимется.

### Где взять Connection string

1. В проекте нажать **Connect** (сверху) или **Project Settings → Database**.
2. Вкладка **ORMs** → Prisma **или** **Connection string**.

Нужны **две** строки:

**A. Transaction pooler (пул)** — порт **6543**:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true
```
Это `DATABASE_URL`. Обязательно `?pgbouncer=true` в конце (иначе Prisma ругается на prepared statements).

**B. Session pooler (для миграций)** — порт **5432**, тот же хост `pooler.supabase.com`:
```
postgresql://postgres.[PROJECT-REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```
Это `DIRECT_URL`.

Почему session pooler, а не «Direct connection» на `db.xxxxx.supabase.co`: прямой адрес часто требует IPv6. Windows 10 его может не иметь, и миграция повиснет. Session pooler на 5432 — это «почти прямое» соединение, которое работает по IPv4.

Если в панели хост выглядит как `aws-0-eu-central-2...` — копируй **как есть**, не подставляй Frankfurt руками. Регион в хосте должен совпасть с тем, что выбрал при создании.

Вставить обе строки:
- в `.env.local` (его читает Next.js)
- в `.env` (его читает Prisma CLI; `prisma.config.ts` подхватывает оба файла)

### Где anon key и service_role key

**Project Settings → API Keys** (или **Settings → API**).

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL` (это не секрет, адрес проекта).
- **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Этот ключ **можно** отдавать браузеру: он работает только в рамках правил безопасности базы (RLS). Сейчас сайт ходит в базу через Prisma на сервере, поэтому ключ пока просто лежит в `.env.local`.
- **service_role** → `SUPABASE_SERVICE_ROLE_KEY`. Этот ключ **нельзя** показывать браузеру и нельзя называть `NEXT_PUBLIC_...`.

Почему service_role нельзя в браузер: он обходит все правила доступа и может читать, менять и удалять любые таблицы. Это как ключ от всей квартиры. Если его вшить в страницу, любой посетитель через «просмотр кода» получит полный доступ к базе.

Строки `NEXT_PUBLIC_` видны всем, кто открыл сайт. service_role — только на сервере.

Ключи на этом этапе в код не подключаем — только сохраняем в `.env.local`, в git они не попадают (`.gitignore` уже закрывает `.env*`).

### Переменные в Vercel (чтобы живой сайт видел базу)

Пока страницы базу не читают (это Этап 5), но переменные заводим сразу: иначе после деплоя сайт «не знает», где база.

1. Открыть https://vercel.com/terrikon/terrikon-rabota/settings/environment-variables
2. **Add New**:
   - Key `DATABASE_URL` — значение как в `.env.local` (пул, порт 6543, `?pgbouncer=true`). Environments: Production, Preview, Development.
   - Key `DIRECT_URL` — session/direct, порт 5432. Те же три среды.
3. Сохранить. Для уже сделанного деплоя переменные сами не подхватятся — нужен новый деплой (после Этапа 5 это станет важно). Сейчас достаточно, что они лежат в настройках.

Не добавляй `SUPABASE_SERVICE_ROLE_KEY` с галочкой «Expose to client» / не используй префикс `NEXT_PUBLIC_`.

### После того как строки вставлены

В папке проекта:

```
npx prisma migrate deploy
npx prisma db seed
npx prisma migrate status
npx prisma studio
```

`migrate deploy` накатывает файл из `prisma/migrations/` на пустую базу. Не рисуй таблицы руками в Table Editor: тогда история миграций разъедется с реальной базой, и следующий `migrate` сломается. Закон 11: всё воспроизводимо.

### Шаблон записи (заполни когда сделаешь)

- Дата: 2026-08-29
- Проект Supabase: `terrikon-rabota` (ref `ptbtyfvszliqagnvpocf`)
- Регион: Frankfurt / `eu-central-1` (хост `aws-0-eu-central-1.pooler.supabase.com`)
- DATABASE_URL и DIRECT_URL вписаны в `.env` и `.env.local`: ☑ (пул 6543 + `pgbouncer=true`, session 5432)
- Vercel: `DATABASE_URL` и `DIRECT_URL` добавлены: ☑ (подтверждено 2026-08-29)
- Ключи anon / service_role сохранены в `.env.local`, в git не попадают: ☑
- Миграция `20260829000000_init` применена: ☑
- Сиды: 15 вакансий (12 местных + 3 вахты), 3 работодателя, 8 сфер, 15 профессий: ☑
- Таблицы руками в Table Editor не создавали: ☑

## 2026-08-29 — Живой сайт: повторный деплой (не заглушка)

- GitHub к Vercel по-прежнему не привязан, поэтому `git push` сам сайт не обновляет.
- Выложили текущий проект командой `npx vercel --prod --yes` (аккаунт `stevenoth`).
- Первый проход после заглушки падал: Vercel ходил в базу со **старым паролем** (`Authentication failed`). `DATABASE_URL` в Production обновили из локального `.env.local` (значение в лог не писали). После второго деплоя https://terrikon-rabota.vercel.app открывает главную города, не текст «Скоро здесь будут вакансии…».
- Чтобы следующие этапы выезжали сами: всё ещё нужно Connect Git Repository — шаги в записи от 2026-08-28.

## 2026-08-30 — Tesseract на Windows (Этап 14B), ещё не установлен

Пока `OCR_PROVIDER=none`: конвейер жив, картинки не читаются. Когда будешь ставить:

1. Установщик: https://github.com/UB-Mannheim/tesseract/wiki (Windows).
2. В мастере отметь язык **Russian**. Папка по умолчанию: `C:\Program Files\Tesseract-OCR`.
3. Добавь эту папку в PATH (системные переменные среды).
4. При необходимости в `.env.local`:
   - `OCR_PROVIDER=tesseract`
   - `TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe`
   - `TESSDATA_PREFIX=C:\Program Files\Tesseract-OCR\tessdata`
5. Новое окно PowerShell, проверка:

```
tesseract --list-langs
```

В списке должны быть `rus` и `eng`.

GitHub Actions (Этап 16, ещё не пишем workflow):

```
sudo apt-get update
sudo apt-get install -y tesseract-ocr tesseract-ocr-rus
tesseract --list-langs
```

Tesseract — системная программа. `pip install -r requirements.txt` ставит `pytesseract`, `pillow` и (с Этапа 15) `psycopg`.

## 2026-08-30 — Этап 15: CRON_SECRET и секреты для двери парсеров

`CRON_SECRET` — пароль, которым роботы доказывают, что они свои. Длина не меньше 32 символов.

Сгенерировать в PowerShell:

```
[BitConverter]::ToString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).Replace('-','').ToLower()
```

Куда вставить одно и то же значение (в git не попадает):

1. `.env.local` — строка `CRON_SECRET=...` (читает Next и `scripts/send_test.py`)
2. Vercel → проект terrikon-rabota → Settings → Environment Variables → `CRON_SECRET` (Production, Preview, Development)
3. GitHub → SteveNoth/terrikon_rabota → Settings → Secrets and variables → Actions:
   - `CRON_SECRET`
   - `SITE_URL` = `https://terrikon-rabota.vercel.app`
   - `DATABASE_URL` и `DIRECT_URL` — те же, что у Prisma (для `scripts/regroup.py` ночью)

Проверка длины (секрет не печатает):

```
((Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' } | Select-Object -First 1) -replace '^CRON_SECRET=','').Trim().Length
```

2026-08-30: секрет есть в `.env.local` (64 символа). В Vercel CLI в списке переменных были `DATABASE_URL` / `DIRECT_URL`, **`CRON_SECRET` и `SITE_URL` ещё не добавлены**. GitHub CLI (`gh`) на этой машине нет — секреты Actions тоже нужно вставить руками (шаг 3 выше). Пока их нет, прод и ночной `regroup.yml` эту дверь не откроют.

Миграция схемы приёма: `npx prisma migrate deploy` (файл `prisma/migrations/20260830150000_parser_ingest`).

## 2026-08-30 — Этап 16: приложение ВКонтакте, токен, GitHub Secrets, минуты Actions

Юридическое решение (почему только официальный API, что не делаем): `docs/SOURCES-LEGAL.md`.

**access_token** — пароль приложения к API. **v** — номер версии API, обязателен в каждом запросе (у нас `5.199`, можно сменить через `VK_API_VERSION`).

### A. Создать приложение и получить токен (только официальный путь)

1. Войти в свой аккаунт ВКонтакте.
2. Открыть https://vk.com/apps?act=manage (или https://vk.ru/apps?act=manage) — «Мои приложения».
3. **Создать** / **Create**. Если предлагают тип: **Standalone-приложение** (отдельное приложение), не игра и не сайт. Имя: `Террикон Работа`. Платформа любая.
4. После создания откроются настройки. Запиши **ID приложения** (число, его не секрет).
5. Токен для чтения **открытых** стен. Два штатных варианта, оба из кабинета VK:

   **Вариант 1 (проще, если доступен в настройках приложения): сервисный ключ.**  
   Настройки приложения → раздел ключей / «Работы с API» → **Сервисный ключ доступа**. Скопируй. Он годится для открытых стен методом `wall.get`.

   **Вариант 2: ключ пользователя, который не истекает через сутки.**  
   В браузере, уже под своим аккаунтом, открой (подставь свой ID приложения вместо `APP_ID`):

   `https://oauth.vk.com/authorize?client_id=APP_ID&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=offline&response_type=token&v=5.199`

   Нажми «Разрешить». Браузер попадёт на страницу `https://oauth.vk.com/blank.html#access_token=...&expires_in=0&...`.  
   Скопируй значение **между** `access_token=` и следующим `&`. Это и есть токен. Параметр `scope=offline` значит «не отключать через 24 часа». Для открытых стен право `wall` не нужно: мы не пишем на стену, только читаем.

6. Токен **никому не отправляй в чат и не клади в git**. Если токен светился в адресной строке — не делай скриншот этой строки.

Не используй токены вида `vk2.a.*` из VK ID, если `wall.get` на них отвечает ошибкой: это ключ входа в аккаунт, не ключ методов API. Не логируйся паролем из скрипта. Не открывай `vk.com/club...` как HTML.

Если API ответит «Access denied» / код 15 или 203 — группа закрыта или метод недоступен этому ключу. Группу выключаем в `scripts/sources_vk.json` (`enabled: false`). Не обходим.

### B. Куда вставить токен локально

В папке проекта файл `.env.local` (он уже в `.gitignore`). Добавь строки, **без пробелов вокруг `=`**. Имя переменной `VK_TOKEN`, значение — токен в той же строке после `=`. Плюс:

```
SOURCE_VK_ENABLED=true
VK_API_VERSION=5.199
OCR_PROVIDER=tesseract
SITE_URL=http://127.0.0.1:3000
```

Строку с самим токеном в этот журнал и в чат не копируй. Образец без значения есть в `.env.example`.

`CRON_SECRET` для обычного запуска (не `--dry-run`) уже должен быть в этом файле с Этапа 15.

Проверка, что токен есть, **не печатая его** (PowerShell, папка проекта):

```
if (((Get-Content .env.local | Where-Object { $_ -like 'VK_TOKEN=*' } | Select-Object -First 1) -replace '^VK_TOKEN=','').Trim().Length -gt 20) { 'токен на месте' } else { 'токена нет или слишком короткий' }
```

### C. GitHub Secrets — куда нажимать

Секреты живут **в репозитории**, не в профиле GitHub. В git они не попадают: Actions подставляет их только во время запуска.

1. Открыть https://github.com/SteveNoth/terrikon_rabota
2. Вкладка **Settings** (настройки **репозитория**, справа вверху у списка файлов; не шестерёнка профиля).
3. Если GitHub просит подтвердить пароль — подтверди.
4. Слева в колонке: **Secrets and variables** → **Actions**.
5. Кнопка **New repository secret**.
6. Добавь три секрета (имя — точно как написано, без пробелов):

   | Name | Value |
   |---|---|
   | `VK_TOKEN` | тот же токен, что в `.env.local` |
   | `CRON_SECRET` | тот же, что в `.env.local` (≥ 32 символа) |
   | `SITE_URL` | `https://terrikon-rabota.vercel.app` |

7. Для каждого: **Add secret**. Значение потом не показывают — только «Update».
8. На этой же странице должны появиться имена (не значения). Для ночного `regroup.yml` по-прежнему нужны `DATABASE_URL` и `DIRECT_URL`, если ещё не добавлены.

Тот же `CRON_SECRET` должен стоять в Vercel, иначе живой сайт не примет пачку от парсера. Пошагово:

1. Открыть https://vercel.com/terrikon/terrikon-rabota/settings/environment-variables (войти тем же GitHub-аккаунтом SteveNoth).
2. Если переменная `CRON_SECRET` уже есть в списке — справа **⋯** → **Edit**. Если нет — кнопка **Add New** / **Create new**.
3. **Key** (имя): `CRON_SECRET` — точно так, без пробелов.
4. **Value** (значение): тот же секрет, что в `.env.local`. В чат его не копируй. Удобно из PowerShell, находясь в папке проекта — секрет попадёт в буфер, вставишь в поле Vercel сочетанием Ctrl+V:

```
Set-Clipboard (((Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' } | Select-Object -First 1) -replace '^CRON_SECRET=','').Trim())
```

5. **Environments:** отметь **Production**, **Preview** и **Development** (все три). Иначе прод будет с секретом, а превью-деплой — без.
6. **Save**.
7. Новая переменная **сама на уже выложенный сайт не попадает**. Нужен новый деплой: на Vercel → вкладка **Deployments** → у верхнего Production **⋯** → **Redeploy** → подтвердить. Если GitHub к проекту всё ещё не привязан — в папке проекта: `npx vercel --prod --yes`.
8. Проверка без печати секрета: после деплоя локальный `python scripts/parser_vk.py --dry-run --limit 5` секрета Vercel не проверяет. Обычный запуск с `SITE_URL=https://terrikon-rabota.vercel.app` проверит дверь: HTTP 401 значит секрет на Vercel другой или деплоя не было; HTTP 200 — совпало.

`SITE_URL` на Vercel для сайта не обязателен: его читает парсер в GitHub Actions из GitHub Secret. На Vercel достаточно `CRON_SECRET` (плюс уже стоящие `DATABASE_URL` / `DIRECT_URL`).

Проверка расписания руками: вкладка **Actions** → слева workflow **parser-vk** → кнопка **Run workflow** → **Run workflow**. После завершения: в run открыть **parser-vk-logs** (Artifacts) и скачать zip с `logs/`.

### D. Минуты GitHub Actions — где смотреть и сколько съест cron

Где смотреть:

1. Счётчик аккаунта: https://github.com/settings/billing (аватар справа вверху → **Settings** → **Billing and licensing** / **Billing**). Блок **Actions** / **Usage** — сколько минут уже израсходовано в этом месяце.
2. Длительность одного запуска: репозиторий → вкладка **Actions** → конкретный run → справа время вроде `3m 12s`.

Сколько съест расписание `0 */3 * * *` (каждый третий час, в `:00`):

- Запусков в сутки: 24 / 3 = **8**
- За месяц (30 дней): 8 × 30 = **240**
- Один прогон примерно: установка Tesseract ~1 мин + pip из кэша ~0.5 мин + запросы к API и OCR 1–4 мин ≈ **3–6 минут**
- Итого: 240 × 4 мин ≈ **960 минут/месяц** (вилка примерно 720–1440)

Лимиты GitHub Free (нужно сверить на странице billing, цифры тарифа меняются):

- **Публичный** репозиторий: минуты стандартных runner’ов обычно не из квоты в 2000 (действует fair use).
- **Приватный**: **2000 минут/месяц** на бесплатном плане. 960 из 2000 — около половины, плюс ночной `regroup.yml` (~1–5 мин/сутки). Если репозиторий станет приватным и минуты кончатся — парсер встанет до 1-го числа. Тогда либо реже cron (`0 */6 * * *` = вдвое меньше), либо публичный репозиторий.

Пока в `sources_vk.json` нет включённых групп, cron всё равно ставит Tesseract и тратит ~1–2 минуты на пустой прогон. Имеет смысл сначала заполнить группы и прогнать **Run workflow** руками, и только потом полагаться на расписание.

Шаблон отметки (допиши когда сделаешь):

- Дата:
- Приложение VK создано, ID:
- `VK_TOKEN` в `.env.local`: ☐ (значение в этот файл журнала не писать)
- GitHub Secrets `VK_TOKEN`, `CRON_SECRET`, `SITE_URL`: ☐
- Vercel `CRON_SECRET` и `SITE_URL`: ☐
- Ручной запуск `parser-vk`: ☐
- Артефакт логов скачивается: ☐

## 2026-08-30 — Этап 17: api_id, api_hash, строка сессии Telegram, GitHub Secrets

Юридическое решение (почему client API, что такое StringSession, что не делаем): `docs/SOURCES-LEGAL.md`.

Это **не** токен бота из `@BotFather` (`TELEGRAM_BOT_TOKEN` — Этап 22). Здесь парсер входит как обычный клиент Telegram и читает публичные каналы.

### A. Что такое `api_id`, `api_hash` и строка сессии

- **`api_id`** — номер твоего приложения на https://my.telegram.org. Число, его видно в кабинете.
- **`api_hash`** — секретный ключ того же приложения. Вместе с `api_id` Telegram понимает, какая программа стучится.
- **Строка сессии (`StringSession`)** — «уже вошли». После того как один раз ввёл телефон и код, скрипт больше не спрашивает SMS. По смыслу это тот же ключ, что файл `account.session` на диске: укравший строку входит в аккаунт. Поэтому строку создаём **один раз локально** и кладём в GitHub Secrets, а файл сессии в git не коммитим (`.gitignore` уже закрывает `*.session`).

Почему не файл в репозитории: Actions крутится на чужой машине GitHub. Если положить `.session` в git, его увидит кто угодно с доступом к репо. Секрет GitHub подставляется только на время запуска и в историю коммитов не попадает.

Лучше отдельный аккаунт Telegram для парсера, не тот, где личная переписка.

### B. Получить `api_id` и `api_hash` на my.telegram.org

1. Открой https://my.telegram.org в браузере.
2. Введи номер телефона аккаунта, с которого парсер будет читать каналы (с кодом страны, например `+7…`).
3. Код подтверждения придёт **в приложение Telegram** (не обязательно SMS). Введи его на сайте.
4. Нажми **API development tools**.
5. Если приложения нет — создай: App title `Terricon Rabota`, Short name `terrikon`, Platform **Other**. URL можно пустым.
6. На странице появятся **App api_id** (число) и **App api_hash** (длинная строка из латиницы и цифр). Скопируй оба. В чат и в git не клади.

Не путай с токеном вида `123456:ABC…` от `@BotFather` — тот сюда не подходит.

### C. Вставить ключи локально и создать строку сессии

В `.env.local` (уже в `.gitignore`), без пробелов вокруг `=`:

```
TG_API_ID=
TG_API_HASH=
SOURCE_TG_ENABLED=true
OCR_PROVIDER=tesseract
SITE_URL=http://127.0.0.1:3000
```

После знака `=` — значения с my.telegram.org. Строку с ключами в этот журнал не копируй. Образец без значений есть в `.env.example`.

Один раз на этой машине, из корня проекта:

```
.\.venv\Scripts\python.exe scripts/make_tg_session.py
```

Скрипт спросит телефон, код из Telegram, пароль двухэтапной проверки (если включён). Файл `*.session` на диск не пишет. В конце напечатает длинную строку между «начало TG_SESSION» и «конец». Это и есть сессия.

Добавь в `.env.local`:

```
TG_SESSION=
```

после `=` — та длинная строка целиком, без кавычек, если в ней нет пробелов.

Проверка, что сессия есть, **не печатая её** (PowerShell, папка проекта):

```
if (((Get-Content .env.local | Where-Object { $_ -like 'TG_SESSION=*' } | Select-Object -First 1) -replace '^TG_SESSION=','').Trim().Length -gt 20) { 'сессия на месте' } else { 'сессии нет' }
```

`CRON_SECRET` для обычного запуска (не `--dry-run`) уже должен быть в этом файле с Этапа 15.

Проверка парсера, когда в `sources_tg.json` появятся каналы:

```
.\.venv\Scripts\python.exe scripts/parser_tg.py --dry-run --limit 5
```

Пока каналы выключены, скрипт напишет, что список пуст, и не пойдёт в Telegram.

### D. GitHub Secrets — куда нажимать

Секреты живут **в репозитории**, не в профиле GitHub. В git они не попадают.

1. Открыть https://github.com/SteveNoth/terrikon_rabota
2. Вкладка **Settings** (настройки репозитория, не шестерёнка профиля).
3. Слева: **Secrets and variables** → **Actions**.
4. **New repository secret**. Добавь (имя — точно как написано):

   | Name | Value |
   |---|---|
   | `TG_API_ID` | число с my.telegram.org |
   | `TG_API_HASH` | ключ с my.telegram.org |
   | `TG_SESSION` | строка из `make_tg_session.py` |
   | `CRON_SECRET` | тот же, что для ВК (≥ 32 символа), если ещё не добавлен |
   | `SITE_URL` | `https://terrikon-rabota.vercel.app` |

5. Для каждого: **Add secret**. Значение потом не показывают — только «Update».

Тот же `CRON_SECRET` должен стоять в Vercel (шаги в записи Этапа 16). Иначе живой сайт не примет пачку.

Проверка расписания руками: вкладка **Actions** → слева workflow **parser-tg** → **Run workflow**. После завершения скачай артефакт **parser-tg-logs**. Расписание: `30 1,4,7,10,13,16,19,22 * * *` — каждые три часа в `:30`, со сдвигом относительно ВК (`0 */3`, то есть в `:00`), чтобы два парсера не стартовали в одну минуту.

### E. Минуты GitHub Actions

Те же 8 запусков в сутки, что у ВК (раз в 3 часа). За месяц ≈ 240 прогонов. Один прогон с Tesseract примерно 3–6 минут ≈ ещё **960 минут/месяц** сверху к парсеру ВК.

Вместе ВК + Telegram ≈ 16 запусков/сутки, порядка 1500–2000 минут/месяц. На **публичном** репозитории минуты стандартных runner’ов обычно не из квоты 2000. На **приватном** бесплатном плане 2000 минут — два парсера плюс `regroup.yml` могут выбрать лимит. Тогда реже cron или публичный репозиторий.

Пока в `sources_tg.json` нет включённых каналов, cron всё равно ставит Tesseract. Сначала заполни каналы, прогони **Run workflow** руками, потом полагайся на расписание.

Шаблон отметки (допиши когда сделаешь):

- Дата:
- Приложение на my.telegram.org создано, api_id: (число можно, hash в этот файл не писать)
- `TG_API_ID` / `TG_API_HASH` / `TG_SESSION` в `.env.local`: ☐
- GitHub Secrets `TG_API_ID`, `TG_API_HASH`, `TG_SESSION`: ☐
- `python scripts/make_tg_session.py` выполнен локально: ☐
- Ручной запуск `parser-tg`: ☐
- Артефакт логов скачивается: ☐

## 2026-08-30 — Этап 18: сайты предприятий, CSS-селекторы, экономия минут Actions

Юридическое решение: `docs/SOURCES-LEGAL.md`, раздел «Сайты предприятий». Список: `scripts/config_web.json`. Выключатель `SOURCE_WEB_ENABLED`.

В конфиге живые HTML-источники (проверены 2026-08-30):

1. https://vodadonbassa.ru/job-openings/ — «Вода Донбасса», филиал Горловское ПУВКХ.
2. https://dtedn.ru/o-predpriyatii/vakansii2?department[]=4 — «Донбасстеплоэнерго», Горловкатеплосеть.
3. https://mozaika.biz/vakansy/ — «Горловская мозаика». Только 1-я страница: `robots.txt` запрещает `/page/`. Часто пересекается с группой ВК `rabota.gorlovka`.
4. https://rabotadnr.com/job/vacancy/city/gorlovka — «Работа ДНР», фильтр Горловка.

Не в конфиге (только API / открытые данные, см. `docs/SOURCES-LEGAL.md`): Avito, OK.ru `rabotavdn`, Мой ЦЗН / `trudvsem.ru`.

Если есть ещё страницы вакансий горловских заводов (Стирол, Горловский машзавод, свои HTML, не hh.ru и не Avito) — пришли URL, добавим.

### A. Как самому найти CSS-селектор через DevTools

Это «картинка шагами». Делается в Chrome или Edge, на странице списка вакансий.

```
┌─────────────────────────────────────────────────────────────┐
│  1. Открой страницу вакансий предприятия.                   │
│                                                             │
│  2. Наведи мышь на ОДНУ карточку (название должности).      │
│     Правая кнопка → «Просмотреть код» / Inspect.            │
│                                                             │
│     ┌──────────────────────┐     ┌────────────────────────┐ │
│     │  [ Сварщик 4 р.    ] │ ──► │ <article class="job">  │ │
│     │    Горловка  45 000  │     │   <h2 class="title">   │ │
│     │                      │     │     <a href="/j/12">   │ │
│     └──────────────────────┘     │   <p class="city">     │ │
│                                  └────────────────────────┘ │
│                                                             │
│  3. В панели Elements подсветится HTML этой карточки.       │
│     Селектор карточки — class/тег, который повторяется      │
│     у КАЖДОЙ вакансии. Это item_selector.                   │
│     Пример: article.job   или   .vacancy-card               │
│                                                             │
│  4. Внутри той же карточки щёлкни название → title_selector │
│     (часто h2 или a). Описание → description_selector.      │
│     Зарплата → salary_selector. Город → city_selector.      │
│     Ссылка «подробнее» → link_selector (тег a).             │
│                                                             │
│  5. Проверь, что селектор не ловит меню и подвал:           │
│     Ctrl+F в панели Elements, вставь селектор,              │
│     счётчик совпадений ≈ числу вакансий на экране.          │
│                                                             │
│  6. Выключи JavaScript (F12 → ⋮ → Settings → Debugger →     │
│     Disable JavaScript) и обнови страницу.                  │
│     Карточки на месте? javascript: false (дешёвый путь).    │
│     Белый экран / «Загрузка…»? javascript: true —           │
│     тогда нужен Playwright, и Actions начнёт качать браузер.│
│                                                             │
│  7. Открой https://сайт/robots.txt.                         │
│     Если твой путь в Disallow — эту страницу не берём.      │
│                                                             │
│  8. Впиши поля в scripts/config_web.json, enabled: true.    │
│     Проверка:                                               │
│     python scripts/parser_web.py --dry-run --limit 5        │
└─────────────────────────────────────────────────────────────┘
```

Пустые селекторы (`""`) можно оставить, если поле лежит в тексте самой карточки: парсер тогда берёт текст элемента `item_selector`.

### B. Почему браузер Playwright в расписании обычно не ставим

`pip install playwright` — маленькая обёртка, она в `requirements.txt`.

`python -m playwright install chromium` качает браузер (~150 МБ) и на Ubuntu ещё системные библиотеки (`--with-deps`). Это **1–3 минуты каждого запуска**. Расписание `0 5 * * *` — раз в сутки, 30 раз в месяц ≈ **30–90 лишних минут**. На приватном репозитории лимит бесплатного плана 2000 минут; ВК и Telegram уже едят Tesseract каждые три часа.

Поэтому workflow `.github/workflows/parser-web.yml` сначала спрашивает `python scripts/parser_web.py --needs-js`. Браузер ставится, только если хоть один включённый сайт в конфиге с `javascript: true`. Сейчас оба источника — обычный HTML, Chromium не качаем. Tesseract в этом workflow тоже нет: текст уже в HTML.

### C. Локальная проверка и секреты

В `.env.local` (уже в gitignore):

```
SOURCE_WEB_ENABLED=true
SITE_URL=http://127.0.0.1:3000
```

`CRON_SECRET` нужен только без `--dry-run` (тот же, что для ВК).

```
.\.venv\Scripts\pip.exe install -r requirements.txt
.\.venv\Scripts\python.exe scripts\parser_web.py --dry-run --limit 5
```

GitHub Secrets те же `CRON_SECRET` и `SITE_URL`, новых ключей нет. Ручной запуск: Actions → **parser-web** → Run workflow. Расписание: `0 5 * * *` (05:00 UTC).

Если в отчёте «сайт X: 0 элементов, вероятно, изменилась вёрстка» — селектор устарел, не «вакансий нет». Открой страницу, повтори шаги A.

Шаблон отметки:

- Дата: 2026-08-30
- Сухой прогон нашёл вакансии с Воды Донбасса / Донбасстеплоэнерго: ☑ (`--dry-run`: Вода — soup, телефоны, уникальные id; DTEDN — soup, ссылки на карточки, индекс 284627 больше не читается как зарплата)
- GitHub Secrets `CRON_SECRET`, `SITE_URL` (уже с Этапа 16): ☐
- Ручной запуск `parser-web`: ☐
- Артефакт логов скачивается: ☐

---

## 2026-08-30 — Этап 18A: открытые данные «Работы России»

Код региона **не угадывали.** Справочник — поле `vacancy.region` в JSON (отдельного списка регионов в WADL нет).

| Что | Значение |
|---|---|
| Код | `9300000000000` |
| Имя в API | Донецкая Народная Республика |
| Откуда взяли | `GET https://opendata.trudvsem.ru/api/v1/vacancies?text=Горловка&limit=2` → `results.vacancies[].vacancy.region.region_code` |
| Подтверждение | `GET https://opendata.trudvsem.ru/api/v1/vacancies/region/9300000000000?offset=0&limit=1` → 200, `meta.total` = 7951 |
| WADL | `https://opendata.trudvsem.ru/api/v1/vacancies/application.wadl` |
| Условия | https://trudvsem.ru/opendata — свободное использование при указании источника |

Горловка в справочнике регионов как субъект не числится (город внутри ДНР). Соседний код не подставляли.

Выключатель: `SOURCE_TRUDVSEM_ENABLED` в `.env.local` / GitHub Actions. Ключа API нет. Секреты те же `CRON_SECRET` и `SITE_URL`.

```
.\.venv\Scripts\python.exe scripts\parser_trudvsem.py --dry-run --limit 3
```

Расписание: `.github/workflows/parser-trudvsem.yml`, cron `0 6 * * *` (после сайтов `0 5`). Tesseract и Chromium не ставим. Оценка минут: при шаге 100 и ~80 страницах пауза 1–3 с ≈ 5–10 мин/запуск × 30 ≈ **150–300 мин/месяц**. С этой машины `limit=100` и `limit=10` дают Read timeout; `limit=5` отвечает. Парсер при таймауте уменьшает шаг до 5, прокси не включает. `--dry-run --limit 3` сам берёт шаг 5.

Живой сухой прогон 2026-08-30:

- Регион 9300000000000, в API 7951
- Собрано 50 записей региона, совпало с городом 3 (Инженер, Слесарь, Слесарь)
- Работодатель «ДОНБАССГАЗ» / филиал, ИНН 9704210635
- Зарплата числом из JSON, подпись `salaryIsGross: True (до вычета налога)`
- `sourceUrl` на `https://trudvsem.ru/vacancy/card/...`, не m-czn.ru
- Чужих городов 47 — пропуск, в dry-run в базу не писали
- OCR_PROVIDER для этого парсера принудительно `none`

Шаблон отметки:

- Дата: 2026-08-30
- Код региона из справочника API, не угадан: ☑ `9300000000000`
- Сухой прогон Горловки с «до вычета» и ссылкой trudvsem: ☑
- HTML m-czn / trudvsem.ru не читаем: ☑
- GitHub Secrets `CRON_SECRET`, `SITE_URL` (те же): ☐
- Ручной запуск `parser-trudvsem`: ☐
- Миграция `trudvsem` накатана на Supabase: ☐

---

## 2026-08-31 — Этап 19: ADMIN_PASSWORD на Vercel и в GitHub

Проект Vercel `terrikon/terrikon-rabota`, репозиторий `SteveNoth/terrikon_rabota`. Значение — то же, что в `.env.local`, в этот журнал не копируем. Без переменной на Vercel страница `/admin` на деплое закрыта.

- **Vercel Production и Preview:** заданы (Production уже был; Preview — 2026-08-31; пользователь подтвердил оба контура).
- **GitHub Secrets** репозитория: `ADMIN_PASSWORD` добавлен пользователем 2026-08-31. Сайт его оттуда не читает — вход в админку идёт через env Vercel. Секрет в Actions пригодится, если когда-нибудь робот будет ходить на `/admin`.
- **Development** на Vercel не ставили: локально читается `.env.local`.

Код админки на живой сайт сам не попадёт, пока GitHub не привязан. После merge в `master`: `npx vercel --prod --yes`, либо Redeploy в кабинете.

---

## 2026-08-31 — Этап 20: Supabase Auth (почта + пароль)

Сайт не ходит в Supabase Auth из страниц. Только `src/lib/adapters/auth.ts`. Ключи уже в `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. `AUTH_DRIVER=supabase` (или `none`, если вход надо выключить).

В кабинете Supabase:

1. **Authentication → Providers → Email** — включён. Confirm email — **включён** (после регистрации человек подтверждает почту по ссылке).
2. **Authentication → URL Configuration**
   - Site URL: локально `http://localhost:3000`, на проде `https://terrikon-rabota.vercel.app` (или актуальный `NEXT_PUBLIC_SITE_URL`).
   - Redirect URLs (все добавить):
     - `http://localhost:3000/auth/callback`
     - `http://localhost:3000/auth/callback?next=/auth/confirmed`
     - `http://localhost:3000/auth/callback?next=/auth/reset`
     - те же три с адресом продакшена.
3. Письма: на бесплатном тарифе — встроенная почта Supabase (лимит небольшой). Для продакшена позже можно свой SMTP; пока хватает.
4. На Vercel те же `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`, плюс `NEXT_PUBLIC_SITE_URL` без слэша на конце. `SUPABASE_SERVICE_ROLE_KEY` для входа **не нужен** (его не кладём в клиент и в адаптер входа не используем).
5. Миграция `20260831180000_employer_auth`: поля `User.authId` и `Employer.userId`. Накатить: `npx prisma migrate deploy` (нужен `DIRECT_URL`).

Проверка: регистрация → письмо → `/auth/confirmed` → вход → кабинет работодателя → вакансия с меткой «Размещено работодателем». Выбор Донецка в форме вакансии не сохраняет, текст про Горловку.

Шаблон отметки:

- Дата: 2026-08-31
- Email-провайдер включён, confirm email: ☐
- Redirect URLs (local + prod): ☐
- Миграция `employer_auth` накатана на Supabase: ☐
- `NEXT_PUBLIC_SITE_URL` на Vercel: ☐

## 2026-08-31 — Этап 20A часть 2: очередь кабинета и блок аккаунта

Миграция `20260831200000_account_blocks`: enum `AccountBlockScope`, таблица `AccountBlock`, флаги `User.publishBlocked` / `applyBlocked` / `loginBlocked`. Накатить: `npx prisma migrate deploy` (нужен `DIRECT_URL`).

Бан в панели Supabase Auth не ставим: источник правды — наша база. Снятие PUBLISH телефон само не белит.

Шаблон отметки:

- Дата: 2026-08-31
- Миграция `account_blocks` накатана на Supabase: ☑ (локально, 2026-08-31)

## 2026-08-31 — Этап 21: кабинет соискателя

Миграция `20260831210000_seeker_profile`: поля `User.resumeText`, `resumeUrl`, `notifyTelegram`, `telegramLinkCode`. Накатить: `npx prisma migrate deploy` (нужен `DIRECT_URL`).

Имя бота `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (без @) нужно только для ссылки `t.me/<бот>?start=<код>`. Пока пусто — в профиле виден код, ссылка появится на Этапе 22. Webhook и рассылку на этом этапе не ставим.

Шаблон отметки:

- Дата: 2026-08-31
- Миграция `seeker_profile` накатана на Supabase: ☑ (локально, 2026-08-31)
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (можно пустым до этапа 22): ☐

## 2026-09-02 — Этап 22: Telegram-бот

Бот уведомлений — это **не** парсер каналов (Этап 17, `TG_SESSION`). Здесь токен от `@BotFather`.

### 1. Создать бота

1. Открыть Telegram, найти **@BotFather** (синяя галочка).
2. Написать `/newbot`.
3. Имя (как видно людям), например: `Террикон Работа`.
4. Username (латиница, обязан кончаться на `bot`), например: `terrikon_rabota_bot`. Если занято — другой.
5. BotFather пришлёт токен вида `123456789:AAH...`. Это пароль бота. В чат и в git не копировать.
6. Сразу задать команды (удобно с телефона): `/setcommands` → выбрать бота → вставить:

```
start - Начать
subscribe - Подписка на вакансии
unsubscribe - Отключить подписку
latest - Последние 5 вакансий
city - Выбрать город
link - Привязать кабинет на сайте
help - Что умеет бот
```

7. `/setjoingroups` → Disable (бот для личных сообщений, не для групп).

### 2. Записать секреты

В `.env.local` (локально) и в Vercel → terrikon-rabota → Settings → Environment Variables (Production и Preview):

| Имя | Что это |
|-----|---------|
| `TELEGRAM_BOT_TOKEN` | токен от BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | случайная строка, только латиница/цифры/`_`/`-`, ≥ 8 символов. PowerShell: `-join ((48..57 + 65..90 + 97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })` |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | username **без** `@` |

`NOTIFY_DRIVER=telegram` уже в `.env.example`.

На Vercel после записи переменных нужен новый деплой, иначе webhook получит 404.

### 3. Миграция базы

```
npx prisma migrate deploy
```

Нужен `DIRECT_URL`. Таблица `TelegramDelivery` + поля `TelegramUser.userId` / `dialog` / `pendingKeywords`.

### 4. Поставить webhook

Только HTTPS. localhost Telegram не вызовет. Адрес сайта: `NEXT_PUBLIC_SITE_URL` или `SITE_URL` (сейчас https://terrikon-rabota.vercel.app).

Из папки проекта, когда токен уже в `.env.local`:

```
npx tsx scripts/telegram-webhook.ts set
npx tsx scripts/telegram-webhook.ts info
```

Что делает `set`: вызывает `setWebhook` с `url=https://…/api/telegram/webhook`, `secret_token=…`, `allowed_updates=["message","callback_query"]`.

Проверка руками (токен подставить у себя, в историю команд лучше не светить):

```
https://api.telegram.org/bot<ТОКЕН>/getWebhookInfo
```

Ждём `"url": "https://terrikon-rabota.vercel.app/api/telegram/webhook"` и пустой `last_error_message`.

Если нет tsx-скрипта, та же ссылка:

```
https://api.telegram.org/bot<ТОКЕН>/setWebhook?url=https://terrikon-rabota.vercel.app/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>&drop_pending_updates=true
```

### 5. Если ошибка

Смотреть `last_error_message` в `getWebhookInfo`.

| Что пишет Telegram | Что сделать |
|--------------------|-------------|
| Connection timed out / Failed to connect | сайт на Vercel не отвечает или неверный URL |
| 404 | код Этапа 22 не задеплоен, нет `/api/telegram/webhook` |
| 401 Unauthorized | секрет заголовка не тот. Снова `npx tsx scripts/telegram-webhook.ts set`. В Vercel должен быть тот же `TELEGRAM_WEBHOOK_SECRET` (или не задан — тогда секрет считается от токена и на Vercel токен должен совпасть) |
| SSL error | только HTTPS продакшена, не http://localhost |
| 401 от getWebhookInfo | сам токен неверный |

Сбросить webhook: `npx tsx scripts/telegram-webhook.ts delete`, потом снова `set`.

Написать боту `/start`. Должен ответить про вакансии активного города из geo.json и показать кнопки внизу.

### 6. Рассылка

Не из `/api/parser/upload`. После каждого парсера GitHub Actions бьёт `POST /api/telegram/notify` с `Authorization: Bearer CRON_SECRET` (`scripts/ci/telegram-notify.sh`). Локально, если сайт запущен:

```
curl -X POST http://127.0.0.1:3000/api/telegram/notify -H "Authorization: Bearer <CRON_SECRET>" -H "Content-Type: application/json" -d "{\"limit\":40}"
```

Шаблон отметки:

- Дата: 2026-09-02
- Бот создан у @BotFather: ☐
- `TELEGRAM_BOT_TOKEN` в `.env.local` и Vercel: ☐
- `TELEGRAM_WEBHOOK_SECRET` в `.env.local` и Vercel: ☐
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`: ☐
- Миграция `telegram_bot` накатана на Supabase: ☑ (локально, 2026-09-02)
- `npx tsx scripts/telegram-webhook.ts set` + `info` без last_error: ☐
- Код Этапа 22 на https://terrikon-rabota.vercel.app/api/telegram/webhook (не 404): ☐
- `/start` отвечает: ☐

---

## 2026-09-02 — Этап 23: SEO, Яндекс.Вебмастер и Google Search Console

Сайт: https://terrikon-rabota.vercel.app  
Карта сайта: https://terrikon-rabota.vercel.app/sitemap.xml  
Правила для роботов: https://terrikon-rabota.vercel.app/robots.txt

Код этапа закрывает заголовки с падежами, JobPosting JSON-LD, канон, превью, `/about` `/help` `/contacts` `/terms`. Ниже — что сделать руками в кабинетах поисковиков. Коды в git не кладём: только в `.env.local` и Vercel.

### Как посмотреть, что видит поисковик

1. Открой карточку вакансии (например `/gorlovka/job/...`).
2. В Chrome: меню → **Дополнительные инструменты** → **Инструменты разработчика** → вкладка **Elements**. Найди `<title>`, `<meta name="description">`, `<link rel="canonical">`, `<script type="application/ld+json">`.
3. Без DevTools: в адресной строке то же самое «просмотреть код страницы» (Ctrl+U). Ищи `JobPosting`.
4. Экономная версия (`?mode=ultra`) — тот же адрес, другой HTML. Канон без `mode` и `page`.

### Валидатор структурированных данных

**Google**

1. https://search.google.com/test/rich-results
2. Вставь URL живой карточки вакансии (не localhost).
3. Должен найтись тип **Job posting**. Ошибок быть не должно. Предупреждения про необязательные поля допустимы.
4. Локально, если сайт ещё не в индексе: кнопка **Проверить код** — вставь HTML карточки (Ctrl+U, скопировать).

**Яндекс**

1. https://webmaster.yandex.ru/tools/microtest/ (или в Вебмастере: **Инструменты** → **Валидатор микроразметки**)
2. URL карточки или HTML.
3. Тип **JobPosting**. Источник вакансии должен быть в разметке/описании — мы не выдаём чужое объявление за вакансию Террикон Работа.

**Превью для мессенджеров**

1. Картинка: `https://terrikon-rabota.vercel.app/gorlovka/job/<slug>/opengraph-image` — название, зарплата, город.
2. Telegram: отправь ссылку на карточку себе в Saved Messages. Если превью старое — бот @webpagebot, команда с URL.
3. WhatsApp иногда кэширует дольше. Новый slug проверяется быстрее.

### Добавить сайт в Яндекс.Вебмастер

1. Войти: https://webmaster.yandex.ru/ (тот же Яндекс, что для почты).
2. **Добавить сайт** → `https://terrikon-rabota.vercel.app`
3. Способ **Метатег** (проще, чем файл):
   - Яндекс покажет содержимое вроде `content="abc123..."`.
   - В Vercel → проект `terrikon-rabota` → Settings → Environment Variables:
     - `NEXT_PUBLIC_YANDEX_VERIFICATION` = этот код (без кавычек), Production и Preview.
     - `NEXT_PUBLIC_SITE_URL` = `https://terrikon-rabota.vercel.app` (если ещё не задан).
   - В `.env.local` то же самое.
   - Новый деплой (`npx vercel --prod --yes` или push, когда GitHub привязан).
4. В исходнике главной должен появиться `<meta name="yandex-verification" content="...">`.
   Корень `https://terrikon-rabota.vercel.app/` для людей — редирект на `/gorlovka`. Вебмастер качает `/` без HTML, поэтому после деплоя этапа 23 робот получает ту же главную через rewrite. Запасной файл: `https://terrikon-rabota.vercel.app/yandex_<код>.html` (способ «HTML-файл» в кабинете).
5. В Вебмастере нажать **Проверить**.
6. После подтверждения: **Индексирование** → **Файлы Sitemap** → добавить `https://terrikon-rabota.vercel.app/sitemap.xml`
7. **Индексирование** → **Переобход страниц** — главная `/gorlovka` и `/robots.txt`.

Если метатег неудобен: Яндекс даёт файл `yandex_<код>.html` в корень `public/`. В git его не коммитим, если это одноразовый секрет; метатег через env надёжнее.

### Добавить сайт в Google Search Console

1. https://search.google.com/search-console
2. **Добавить ресурс** → тип **Префикс URL** → `https://terrikon-rabota.vercel.app`
3. Способ **Метатег HTML**:
   - Код из атрибута `content`.
   - Vercel и `.env.local`: `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` = этот код.
   - Тот же деплой, что для Яндекса.
4. В HTML: `<meta name="google-site-verification" content="...">`.
5. **Подтвердить**.
6. **Файлы Sitemap** → `https://terrikon-rabota.vercel.app/sitemap.xml`

Альтернатива: подтверждение через DNS у регистратора — для домена на Vercel не обязательно, пока живём на `*.vercel.app`.

### Что должно открываться без кабинета

| Адрес | Ожидание |
|-------|----------|
| `/robots.txt` | `Disallow: /admin`, `/api`, `/profile`, `/employer`; строка `Sitemap:` |
| `/sitemap.xml` | список URL; если вакансий больше 5000 — индекс со ссылками на `/sitemaps/0`, `/sitemaps/1`, … |
| `/gorlovka` | title «Работа в Горловке — свежие вакансии \| Террикон Работа» |
| `/donetsk` | title «Работа в Донецке — скоро на Террикон Работа» |
| `/about#plans` | блок городов soon/planned |
| `/help`, `/contacts`, `/terms` | тексты про источники и удаление вакансии |

Сфера в адресе — `stroitelstvo`, не `stroy`: `/gorlovka/jobs?sphere=stroitelstvo`.

Локально (2026-09-02, `npx next start` после сборки): заголовки с падежами совпали с шаблонами; в sitemap столько же активных вакансий, сколько отдаёт `/api/vacancies`; на карточке есть `JobPosting`; картинка `/gorlovka/job/<slug>/opengraph-image` — PNG ~21 КБ; `/admin` отдаёт заголовок `X-Robots-Tag: noindex, nofollow`. Живой Telegram и кабинеты Яндекса/Google — после деплоя, шаги выше.

Шаблон отметки:

- Дата:
- `NEXT_PUBLIC_SITE_URL` на Vercel: ☐
- Сайт в Яндекс.Вебмастере: ☐
- Sitemap добавлен в Вебмастер: ☐
- `NEXT_PUBLIC_YANDEX_VERIFICATION` в Vercel: ☐
- Сайт в Google Search Console: ☐
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` в Vercel: ☐
- Rich Results / валидатор Яндекса по карточке вакансии без ошибок: ☐
- Превью ссылки в Telegram: ☐

---

## 2026-09-02 — Этап 24: наблюдаемость — что сделать руками

Код уже в репозитории (ветка `stage-24-observability`). Сайт, база и GitHub Actions сами ничего не узнают, пока не накатить миграцию, не прописать две переменные и не выложить код. Порядок ниже — как есть: сначала база, потом секреты, потом деплой, потом проверка.

GitHub к проекту Vercel по-прежнему не привязан: `git push` живой сайт не обновляет. После merge в `master` — `npx vercel --prod --yes` из папки проекта (как на предыдущих этапах). Расписание keep-alive и parser-watch GitHub запускает **только с ветки `master`**. Пока yml лежат лишь в рабочей ветке, кнопкой **Run workflow** можно проверить руками, по часам ничего не пойдёт.

---

### 1. Накатить миграцию

Нужен интернет до Supabase и `DIRECT_URL` в `.env` / `.env.local` (прямое соединение, порт 5432, не пул 6543). CLI Prisma читает оба файла (`prisma.config.ts`).

В папке проекта, PowerShell:

```
npx prisma migrate deploy
```

В списке должна появиться `20260902180000_observability`. Она добавляет две таблицы: `RumSample` (замеры LCP/CLS/INP) и `OpsAlert` (чтобы одна и та же тревога не приходила каждый час).

Если команда пишет `P1001` / `Can't reach database server` — база недоступна или уснула. Тогда:

1. Открыть https://supabase.com/dashboard → проект `terrikon-rabota`.
2. Если статус **Paused** — Restore / Resume (название кнопки в кабинете может быть Restore). Подождать 1–2 минуты.
3. Снова `npx prisma migrate deploy`.

Таблицы в Table Editor руками не рисовать: история миграций разъедется с базой.

Пока этой миграции нет, `/api/health` честно скажет, что схема неполная (503), а `/admin/health` не покажет метрики.

Проверка: `npx prisma migrate status` — pending не должно остаться.

---

### 2. Chat id для тревог в Telegram

Это **не** токен BotFather и не `TG_SESSION` парсера. Это номер твоего чата с уже существующим ботом Этапа 22, чтобы сайт писал *тебе*: «парсер ВКонтакте затих». Telegram не даст боту написать человеку, который ни разу не нажал `/start`.

1. Открой в Telegram того бота, чей username в `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (без `@`). Если переменная ещё пустая — сначала Этап 22 (бот у @BotFather, токен в Vercel, webhook).
2. Напиши ему `/start`. Должен прийти обычный ответ бота. Если бот молчит — webhook: `npx tsx scripts/telegram-webhook.ts set`, затем `info`.
3. Узнай число chat id. В Supabase → проект `terrikon-rabota` → **SQL Editor** → New query:

```sql
SELECT "chatId", "createdAt"
FROM "TelegramUser"
ORDER BY "createdAt" DESC
LIMIT 5;
```

Run. В верхней строке — твой id. Это цифры, иногда с минусом (группа). Не username и не `@name`.

Запасной способ, если таблицы ещё нет: бот [@userinfobot](https://t.me/userinfobot) в личке покажет `Id`. То же число.

4. В файл `.env.local` добавь строку (подставь своё число, без кавычек и без `@`):

```
TELEGRAM_ADMIN_CHAT_ID=123456789
```

5. То же имя и то же значение — в Vercel, иначе живой сайт тревогу не отправит:

   1. https://vercel.com/terrikon/terrikon-rabota/settings/environment-variables
   2. **Add New** / **Create new**.
   3. Key: `TELEGRAM_ADMIN_CHAT_ID`
   4. Value: то же число, что в `.env.local`.
   5. Environments: **Production** и **Preview**.
   6. Save. Переменная на уже выложенный деплой сама не попадает — нужен новый деплой (шаг 4).

Без этой переменной watchdog видит поломку парсера, пишет в журнал «некуда слать» и в Telegram молчит.

---

### 3. Секреты GitHub Actions (keep-alive и watchdog)

Расписания живут в `.github/workflows/keep-alive.yml` и `parser-watch.yml`. Они появятся на GitHub только после **push**. Кнопки **Actions** до пуша не будет. Сами по часам они заработают после попадания этих файлов в **`master`**.

Открой https://github.com/SteveNoth/terrikon_rabota/settings/secrets/actions

Нужны два секрета (если уже стоят с Этапа 16 — не дублируй, проверь что имена есть в списке):

| Имя | Значение | Зачем |
|-----|----------|--------|
| `SITE_URL` | `https://terrikon-rabota.vercel.app` | keep-alive и watchdog знают, какой сайт дергать |
| `CRON_SECRET` | тот же, что в `.env.local` (≥ 32 символа) | watchdog стучится в `/api/ops/watch`; без секрета дверь закрыта |

Как добавить: **New repository secret** → имя точно как в таблице → значение → **Add secret**. Редактировать уже существующий: имя в списке → **Update**. Значение потом не показывают.

Тот же `CRON_SECRET` должен быть и в Vercel (Production), иначе GitHub дойдёт до сайта, а сайт ответит 401. Как копировать из `.env.local` в буфер, не светя секрет в чат:

```
Set-Clipboard (((Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' } | Select-Object -First 1) -replace '^CRON_SECRET=','').Trim())
```

В Vercel: Settings → Environment Variables → `CRON_SECRET` → вставить Ctrl+V. После смены — новый деплой.

`SITE_URL` на Vercel для сайта не обязателен: его читают скрипты Actions и парсеры, не страницы.

На 2026-08-30 в журнале Этапа 15–16 эти два секрета ещё стояли ☐. Если с тех пор не добавлял — шаг обязателен, иначе keep-alive напишет «SITE_URL пуст» и тихо выйдет.

---

### 4. Выложить код на живой сайт

Пока GitHub не подключён к Vercel:

```
npx vercel --prod --yes
```

из папки проекта, на ветке с кодом этапа 24 (или после merge в `master`).

После деплоя подожди минуту. Проверка без входа:

В браузере: `https://terrikon-rabota.vercel.app/api/health`

Должен открыться JSON. Смотри поля:

- `"status": "ok"` или `"degraded"` и HTTP 200 — сайт и база живы. `degraded` значит парсер просел, это не «сайт упал».
- `"status": "down"` и HTTP 503 — база не отвечает или миграция не накатана. Вернись к шагу 1.
- Если страница «Application error» — деплой без нового кода или падение функции; смотри Vercel → Deployments → логи.

Админка: `https://terrikon-rabota.vercel.app/admin/health` — тот же пароль `ADMIN_PASSWORD`, что у `/admin`. На странице: размер базы, парсеры, доля Full / Lite / Ultra. Пока мало заходов, в метриках будет «пока нет замеров» — это нормально.

Чтобы появились цифры RUM: открой главную города в обычном браузере (Full/Lite), подожди несколько секунд. Ultra сам пишет заход с сервера. Админку, `/auth`, `/employer`, `/profile` счётчик пропускает.

---

### 5. Включить расписания на GitHub

Это **не** деплой сайта. Шаг 4 выкладывает код на Vercel. Шаг 5 включает двух роботов на GitHub, которые по расписанию стучатся в уже живой сайт.

Представь двух сторожей:

- **keep-alive** — раз в три дня открывает дверь базы: «ты ещё не спишь?». Бесплатный Supabase без запросов ~7 дней уходит в паузу. Сторож дергает публичный адрес `/api/health`. Пароля нет: health не отдаёт персональные данные.
- **parser-watch** — каждый час спрашивает сайт: «парсеры живы?». Сайт смотрит последние запуски и при поломке пишет тебе в Telegram. Тут уже нужен пароль `CRON_SECRET`, иначе любой в интернете мог бы дёргать тревогу.

Оба живут как GitHub Actions: GitHub по cron поднимает чужой Linux, выполняет скрипт, гасит машину. Файлы:

- `.github/workflows/keep-alive.yml` → скрипт `scripts/ci/keep-alive.sh`
- `.github/workflows/parser-watch.yml` → скрипт `scripts/ci/parser-watch.sh`

Пока эти файлы только на твоём диске, вкладка Actions их не видит. GitHub читает то, что **запушено**. Часовой cron GitHub запускает **только с ветки `master`** (default). Кнопка **Run workflow** умеет и с рабочей ветки — ею проверяем сразу, не дожидаясь merge.

Если в репозитории уже крутятся `parser-vk` / `parser-tg` и т.п., Actions включены. Новых секретов шаг 5 не просит: те же `SITE_URL` и `CRON_SECRET` из шага 3.

#### 5.1. Чтобы роботы появились в списке

1. Закоммить и запушь ветку с файлами `.github/workflows/keep-alive.yml` и `parser-watch.yml` (если ещё не пушил).
2. Чтобы **часы** заработали — влей эту ветку в `master` и запушь `master`. Пока yml только в `stage-24-observability`, по расписанию тишина; кнопка Run уже может работать, если в Run workflow выбрать эту ветку.
3. Открой https://github.com/SteveNoth/terrikon_rabota/actions (вкладка **Actions** у репозитория, не Settings).
4. Слева — список workflow. Ищи имена **keep-alive** и **parser-watch** (как `name:` в yml, не имя файла).
5. Если вместо списка жёлтый баннер **Enable workflows** / **I understand my workflows, go ahead and enable them** — нажми, иначе ничего не запустится.

В списке не будет запусков, пока сам не нажмёшь Run или не дождёшься cron. Пустой список справа — нормально.

#### 5.2. Проверка keep-alive руками

Не жди трёх дней. Цель: увидеть, что GitHub дошёл до `https://terrikon-rabota.vercel.app/api/health`.

1. Слева нажми **keep-alive**.
2. Справа кнопка **Run workflow** (иногда только иконка ▶). Если кнопки нет — yml ещё не на выбранной ветке, вернись к 5.1.
3. Выпадашка **Use workflow from**: для постоянной работы — `master`. Чтобы проверить сразу после пуша рабочей ветки — выбери `stage-24-observability`.
4. **Run workflow**. Через 1–2 секунды обнови страницу (GitHub иногда не рисует новый run сразу).
5. Открой свежий run (жёлтый кружок = ещё идёт, зелёный = скрипт вышел с кодом 0, красный = упал).
6. Клик по job **ping** → шаг **Ping / api/health**.

Что должно быть в логе:

| Текст | Смысл | Что делать |
|-------|--------|------------|
| `Keep-alive, попытка 1 → https://terrikon-rabota.vercel.app/api/health` и ниже JSON, затем `HTTP 200` | сайт и база ответили | ничего |
| то же, но `HTTP 503` и в JSON `"status": "down"` | до сайта дошли, база нездорова или миграция не накатана | шаг 1; для keep-alive это **успех**: проект уже не спит |
| `SITE_URL пуст — keep-alive пропускаю.` | в GitHub Secrets нет `SITE_URL` | шаг 3. Галочка будет **зелёная** — скрипт специально выходит 0, чтобы пустой секрет не краснил Actions. Это не «всё работает» |
| 4 раза таймаут, в конце `За 4 попытки /api/health не ответил` | неверный `SITE_URL`, сайт лежит, или пауза Supabase дольше обычного | проверь секрет, открой health в браузере, в кабинете Supabase не Paused |
| `Unrecognized named-value: 'secrets.SITE_URL'` или пустой env | секрет с опечаткой в имени | имя должно быть точно `SITE_URL` |

Зелёная галочка без строки `HTTP 200` / `HTTP 503` — смотри таблицу, часто это пустой `SITE_URL`.

#### 5.3. Проверка parser-watch руками

Тот же ритуал, workflow **parser-watch**, job **watch**, шаг **Check parsers**.

Скрипт стучится на `https://terrikon-rabota.vercel.app/api/ops/watch` с заголовком `Authorization: Bearer <CRON_SECRET>`. Сайт должен быть уже с кодом этапа 24 (шаг 4), иначе будет 404.

В логе будет JSON. Смотри поля, не только цвет run. Скрипт при 401/404 тоже выходит 0 («чтобы не маскировать парсеры») — красным Actions не загорится.

| Что в логе | Смысл | Что делать |
|------------|--------|------------|
| `SITE_URL или CRON_SECRET пусты — проверку парсеров пропускаю.` | нет секрета в GitHub | шаг 3 |
| HTTP 401, `"code": "UNAUTHORIZED"`, `"Нет доступа."` | секрет в GitHub ≠ секрет на Vercel, или на Vercel его нет / деплоя после записи не было | шаг 3 + новый деплой |
| HTTP 404 | на проде нет `/api/ops/watch` | шаг 4 |
| `"ok": true`, `"alerts": []`, `"sent": 0`, `"reason": null` | парсеры в порядке, писать не о чем | так и должно быть в обычный день |
| `"reason": "TELEGRAM_ADMIN_CHAT_ID не задан"` | сайт видит поломку, но в Telegram молчит | шаг 2, переменная на Vercel + деплой |
| `"reason": "уже сообщали, повтор не раньше чем через 6 часов"` | тревога уже уходила | ничего; следующее сообщение не раньше чем через 6 часов |
| `"reason": "Telegram не принял сообщение"` | chat id неверный или боту не писали `/start` | шаг 2: `/start`, проверить число |
| `"sent": 1` (или больше) и в Telegram сообщение «Террикон Работа: парсеры» | сторож живой | ничего |

Пороги на стороне сайта, не GitHub: ВК и Telegram — 6 часов без запуска; сайты предприятий и ЦЗН — 26 часов; либо два последних завершённых запуска с 0 принятых вакансий.

#### 5.4. Что будет само, без кнопки

Когда оба yml лежат в **`master`**:

- keep-alive — cron `17 6 */3 * *`: примерно раз в 3 дня в **06:17 UTC** (09:17 по Москве зимой, 09:17/10:17 в зависимости от летнего времени; GitHub cron в UTC и может сдвинуться на десятки минут).
- parser-watch — cron `20 * * * *`: каждый час в **:20 UTC** (23-я минута часа по Москве зимой: 03:20 МСК = 00:20 UTC и т.д.).

Первый час после появления файла GitHub иногда пропускает. Если через сутки в Actions нет ни одного run с пометкой `schedule` — проверь, что yml именно в `master`, не только в рабочей ветке.

GitHub **выключает все cron**, если в репозиторий **60 дней никто не пушил**. Тогда keep-alive тоже замолкает, и база снова может уснуть. Лечится любым пушем или снова **Run workflow**.

Минуты Actions: оба job короткие (curl, таймаут 5 минут). Keep-alive раз в 3 дня почти ничего не ест. Parser-watch — 24 коротких запуска в сутки, как остальные парсерные cron. Лимит смотреть: GitHub → Settings (аккаунт SteveNoth, не репозиторий) → Billing → Actions. Подробнее — запись Этапа 16, блок D.

---

### 6. Проверка «уснувшего» парсера (по желанию)

На живом сайте после шагов 2–5, из PowerShell (секрет не печатай в чат):

```
$secret = (((Get-Content .env.local | Where-Object { $_ -like 'CRON_SECRET=*' } | Select-Object -First 1) -replace '^CRON_SECRET=','').Trim())
Invoke-RestMethod -Uri "https://terrikon-rabota.vercel.app/api/ops/watch" -Headers @{ Authorization = "Bearer $secret" }
```

Если какой-то парсер реально не запускался дольше порога (ВК/Telegram — 6 часов, сайты и ЦЗН — 26 часов) или принял 0 вакансий два раза подряд — в Telegram придёт сообщение. Одну и ту же поломку бот не повторяет чаще чем раз в 6 часов.

---

### 7. Git-hook на этой машине (бюджеты перед коммитом)

Один раз в папке проекта:

```
node scripts/install-git-hooks.mjs
```

Дальше каждый `git commit` сначала гоняет `npm run check:design` и `npm run check:budget`. Если специально импортировать `moment` / `lodash` / `recharts` — коммит не пройдёт. `npm install` ставит hook сам (скрипт `prepare`).

Проверка бюджетов без коммита: `npm run build`, затем `npm run check:budget`.

---

### Как понять, что проект Supabase уснул

Бесплатный проект без запросов к базе около **семи дней** уходит в паузу.

Признаки:

1. Сайт крутится дольше минуты или отдаёт ошибку.
2. `https://terrikon-rabota.vercel.app/api/health` не открывается или JSON с `"status": "down"` и HTTP 503.
3. В кабинете Supabase у `terrikon-rabota` статус **Paused**.

Первый живой запрос будит проект (часто 30–90 секунд); keep-alive специально пробует health несколько раз. Если Actions выключены (шаг 5) — пауза снова возможна.

---

Шаблон отметки:

- Дата: 2026-09-02
- Миграция `20260902180000_observability` накатана: ☑
- `TELEGRAM_ADMIN_CHAT_ID` в `.env.local`: ☑
- `TELEGRAM_ADMIN_CHAT_ID` в Vercel (Production + Preview) + новый деплой: ☑
- `SITE_URL` в GitHub Secrets: ☑
- `CRON_SECRET` в GitHub Secrets и в Vercel совпадают: ☑
- Код этапа 24 на https://terrikon-rabota.vercel.app: ☑
- `/api/health` на проде открывается JSON: ☑
- `/admin/health` открывается: ☑
- yml keep-alive и parser-watch в `master`: ☑ (PR `stage-24-observability` → `master`)
- Actions: пробный Run workflow keep-alive и parser-watch прошёл: ☑
- Шаг 6 (ручной вызов `/api/ops/watch` из PowerShell): ☐ пропущен, по желанию
- Шаг 7 (`node scripts/install-git-hooks.mjs` на этой машине): ☐ пропущен, по желанию (`npm prepare` ставит hook при `npm install`)

---

## 2026-09-02 — Этап 25: гигиена данных — что сделать руками

Код на ветке `stage-25-data-hygiene`. Расписания GitHub запускает **только с ветки `master`**. Пока yml в рабочей ветке — проверка кнопкой **Run workflow**. GitHub к Vercel по-прежнему не привязан: после merge — `npx vercel --prod --yes`.

Очистка ходит в базу напрямую (`DIRECT_URL`), как ночной `regroup`. Счётчики и отчёт о размере бьют в сайт (`SITE_URL` + `CRON_SECRET`), как watchdog.

---

### 1. Накатить миграцию

Нужен интернет до Supabase и `DIRECT_URL` в `.env` / `.env.local` (порт 5432, не пул 6543).

```
npx prisma migrate deploy
```

В списке должна появиться `20260902210000_data_hygiene`. Таблицы: `CityStat`, `SphereStat` (счётчики, чтобы страницы не считали Vacancy на каждом заходе), `DbSizeSample` (еженедельный снимок для прогноза). Индексы очистки на `Vacancy(isActive, lastSeenAt)` и `ParserRun(startedAt)`.

2026-09-02 с этой машины миграция уже накатана (`npx prisma migrate deploy`). Повторный вызов безопасен: pending не останется.

Таблицы в Table Editor руками не рисовать.

Проверка: `npx prisma migrate status` — pending нет.

---

### 2. Первый пересчёт счётчиков и сухой прогон очистки

Пока hourly cron не сработал, главная всё ещё может посчитать Vacancy сама (запасной путь). Чтобы сразу читать готовые числа:

```
npx tsx scripts/recompute-counts.ts
npx tsx scripts/cleanup.ts --dry-run
```

`--dry-run` обязан показать «будет удалено N записей» и **ничего не удалить**. GeocodeCache в отчёте есть строкой «не трогаем». Без `--apply` скрипт всегда в этом режиме, даже если флаг забыли.

Живое удаление вручную (когда сухой прогон выглядит правдой):

```
npx tsx scripts/cleanup.ts --apply
```

На проде это делает workflow `hygiene-cleanup` раз в сутки (`40 3 * * *`).

---

### 3. Бэкап: куда класть и чем проверять

**Локально** файл всегда в папку `backups/` в корне проекта (gitignore, в git не попадает).

Нужен `pg_dump` в PATH (клиент PostgreSQL) или Docker с образом `postgres:16`.

```
npm run db:backup
```

Появится `backups/terrikon-ГГГГ-ММ-ДД.dump`. Это схема `public` (таблицы Prisma). Пользователи входа в Supabase Auth в этот файл не входят.

**Проверка восстановлением на этой машине** (если есть Docker):

```
docker run -d --name tr-restore-check -e POSTGRES_USER=restore -e POSTGRES_PASSWORD=restore -e POSTGRES_DB=terrikon_check -p 55432:5432 postgres:16
docker run --rm --network host -v ${PWD}/backups:/backups postgres:16 pg_restore --no-owner --no-acl --dbname=postgresql://restore:restore@127.0.0.1:55432/terrikon_check /backups/terrikon-ГГГГ-ММ-ДД.dump
```

В PowerShell `${PWD}` работает в Docker Desktop. Потом:

```
docker exec tr-restore-check psql -U restore -d terrikon_check -c "SELECT COUNT(*) FROM \"Vacancy\";"
docker rm -f tr-restore-check
```

Число вакансий должно совпасть с живой базой (или быть не меньше сидов).

**В GitHub Actions** то же самое делает `.github/workflows/hygiene-backup.yml` каждое воскресенье 04:10 UTC: выгрузка → restore на одноразовый Postgres 16 → проверка таблиц `Vacancy` / `GeocodeCache` / `_prisma_migrations` → зашифрованный артефакт 30 дней. Бэкап, который этот restore не прошёл, не считается бэкапом.

Чтобы артефакт появился, в GitHub Secrets нужен `DIRECT_URL` (уже есть у `regroup.yml`) и желательно `BACKUP_PASSPHRASE`. Если пароля нет — шифруем `CRON_SECRET`. Расшифровка:

```
openssl enc -d -aes-256-cbc -pbkdf2 -in terrikon-ГГГГ-ММ-ДД.dump.enc -out terrikon.dump -pass pass:ВАШ_ПАРОЛЬ
```

---

### 4. Отчёт о размере в Telegram

Тот же `TELEGRAM_ADMIN_CHAT_ID`, что для тревог парсеров. Локально без отправки:

```
npx tsx scripts/db-size-report.ts --dry-run
```

С записью снимка и отправкой:

```
npx tsx scripts/db-size-report.ts --apply
```

Расписание: `.github/workflows/hygiene-size.yml`, понедельник 04:20 UTC. Бьёт `POST /api/ops/size` с `CRON_SECRET`. Первый замер честно пишет «прогноз после второго». Со второго — «на сколько хватит до 400 МБ и до 500 МБ».

Пороги и шаги переезда: `docs/MIGRATION.md`.

---

### 5. Секреты GitHub и деплой

Открой https://github.com/SteveNoth/terrikon_rabota/settings/secrets/actions

Должны быть (не дублируй, проверь имена):

| Имя | Откуда |
|---|---|
| `DIRECT_URL` | уже для regroup |
| `DATABASE_URL` | уже для regroup |
| `SITE_URL` | уже для парсеров / watchdog |
| `CRON_SECRET` | уже для двери |
| `BACKUP_PASSPHRASE` | новый, по желанию; иначе шифруем `CRON_SECRET` |

На Vercel ничего нового, кроме деплоя кода: счётчики и отчёт размера ходят на сайт.

После merge в `master`:

1. `npx vercel --prod --yes` (пока GitHub не привязан).
2. Actions → `hygiene-cleanup` → Run workflow, можно с apply=false (только dry-run).
3. Actions → `hygiene-counts` → Run workflow.
4. Actions → `hygiene-size` → Run workflow — в Telegram должен прийти отчёт.
5. Actions → `hygiene-backup` → Run workflow — в логе «Восстановление на проверочной базе прошло», в артефактах `.enc`.

---

Шаблон отметки:

- Дата:
- Миграция `20260902210000_data_hygiene` накатана: ☐
- `npx tsx scripts/cleanup.ts --dry-run` показал N и ничего не удалил: ☐
- `npx tsx scripts/recompute-counts.ts` записал CityStat/SphereStat: ☐
- `npm run db:backup` дал файл в `backups/`: ☐
- restore на проверочной базе (Docker или Actions) прошёл: ☐
- `BACKUP_PASSPHRASE` в GitHub Secrets (или полагаемся на `CRON_SECRET`): ☐
- Код этапа 25 на https://terrikon-rabota.vercel.app: ☐
- Отчёт о размере пришёл в Telegram: ☐
- yml гигиены в `master`: ☐



