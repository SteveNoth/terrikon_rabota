"""Одноразовое создание строки сессии Telegram (StringSession).

Зачем этот файл
---------------
Парсер каналов (scripts/parser_tg.py) входит в Telegram **как клиент**,
не как бот. Для этого нужны три вещи:

1. api_id    — номер приложения с https://my.telegram.org
2. api_hash  — секретный ключ того же приложения
3. строка сессии (StringSession) — «уже вошли в аккаунт», чтобы GitHub
   Actions не спрашивал телефон и код из SMS.

Файл сессии вида ``*.session`` — это база SQLite с ключами входа.
Его нельзя класть в git: укравший файл читает личку и пишет от твоего
имени. Строка сессии — тот же ключ, но её кладут в GitHub Secrets,
а не в репозиторий. Этот скрипт создаёт **только строку** и не пишет
файл ``*.session`` на диск.

Как получить api_id и api_hash
------------------------------
1. Открой https://my.telegram.org в браузере.
2. Войди **номером телефона того аккаунта**, с которого парсер будет
   читать каналы (лучше отдельный аккаунт, не личный с перепиской).
3. Код придёт в приложение Telegram — введи его на сайте.
4. Нажми **API development tools**.
5. Если приложения ещё нет: Create application.
   App title: ``Terricon Rabota``. Short name: ``terrikon``.
   Platform: Other. URL можно не указывать.
6. На странице появятся **App api_id** (число) и **App api_hash**
   (латиница и цифры). Это не токен бота из @BotFather.
7. Вставь в ``.env.local`` (файл уже в .gitignore) три строки:
   ``TG_API_ID=`` (число с сайта), ``TG_API_HASH=`` (ключ с сайта),
   ``SOURCE_TG_ENABLED=true``. Пробелов вокруг ``=`` быть не должно.
   Значения в чат и в git не копируй.

Как запустить этот скрипт
-------------------------
Из корня проекта, один раз на этой машине:

  .\\.venv\\Scripts\\python.exe scripts/make_tg_session.py

Скрипт спросит телефон (с кодом страны, например +7…), затем код из
Telegram, затем пароль двухэтапной проверки, если он включён.
В конце напечатает длинную строку — это и есть StringSession.

Куда положить строку
--------------------
1. ``.env.local`` — строка ``TG_SESSION=...`` (в кавычки не обязательно,
   если в строке нет пробелов).
2. GitHub → репозиторий terrikon_rabota → Settings → Secrets and
   variables → Actions → New repository secret → имя ``TG_SESSION``.
   Туда же, если ещё нет: ``TG_API_ID``, ``TG_API_HASH``.

Почему нельзя файл сессии в репозиторий
---------------------------------------
Файл ``xyz.session`` — полноценный вход. Actions на чужой машине его
не прочитает из git без того, чтобы сессия стала публичной. Секрет
GitHub подставляется только во время запуска workflow и в лог не
печатается, если мы сами его не выведем. Этот скрипт как раз для того,
чтобы один раз войти локально (там есть телефон и SMS) и больше никогда
не возить файл.

Пошаговые клики ещё раз: docs/SETUP-LOG.md, раздел «Этап 17».
Юридически (почему client API, что не делаем): docs/SOURCES-LEGAL.md.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
ROOT = _SCRIPTS.parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from parser_env import load_env

load_env()


def _need(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise SystemExit(
            f"Нет {name} в .env.local.\n"
            "Сначала получи api_id и api_hash на https://my.telegram.org\n"
            "(API development tools) и вставь строки TG_API_ID= и TG_API_HASH=.\n"
            "Подробно: docs/SETUP-LOG.md, раздел «Этап 17»."
        )
    return value


def main() -> int:
    print("Создание строки сессии Telegram (StringSession).")
    print("Файл *.session на диск не пишем — только строка в консоль.")
    print("Потом её кладут в .env.local и GitHub Secrets, не в git.")
    print()
    api_id_raw = _need("TG_API_ID")
    api_hash = _need("TG_API_HASH")
    try:
        api_id = int(api_id_raw)
    except ValueError:
        raise SystemExit("TG_API_ID должен быть числом с my.telegram.org.") from None

    try:
        from telethon.sessions import StringSession
        from telethon.sync import TelegramClient
    except ImportError as exc:
        raise SystemExit(
            "Нет пакета telethon. Из корня проекта:\n"
            "  .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt"
        ) from exc

    print("Дальше Telegram спросит телефон и код. Это вход в аккаунт.")
    print("Лучше отдельный аккаунт для парсера, не личная переписка.")
    print()

    session = ""
    last_error: BaseException | None = None
    for use_ipv6 in (False, True):
        client = TelegramClient(
            StringSession(),
            api_id,
            api_hash,
            timeout=15,
            connection_retries=2,
            retry_delay=1,
            use_ipv6=use_ipv6,
        )
        try:
            client.start()
            session = client.session.save()
            break
        except Exception as exc:
            last_error = exc
            print(f"Вход по IPv{'6' if use_ipv6 else '4'} не удался ({type(exc).__name__}).")
        finally:
            try:
                client.disconnect()
            except Exception:
                pass
    if not session:
        raise SystemExit(
            "Сессия пустая — вход не удался, строку не печатаю. "
            f"{last_error or ''}".strip()
        )

    print()
    print("Готово. Скопируй строку целиком (один длинный кусок без пробелов).")
    print("Никому не пересылай и не клади в git / sources_tg.json / чат.")
    print()
    print("----- начало TG_SESSION -----")
    print(session)
    print("----- конец TG_SESSION -----")
    print()
    print("В .env.local добавь строку:")
    print("TG_SESSION=<вставь сюда>")
    print()
    print("В GitHub Secrets — секрет с именем TG_SESSION, то же значение.")
    print("Проверка без печати строки (PowerShell, папка проекта):")
    print(
        "if (((Get-Content .env.local | Where-Object { $_ -like 'TG_SESSION=*' }"
        " | Select-Object -First 1) -replace '^TG_SESSION=','').Trim().Length -gt 20)"
        " { 'сессия на месте' } else { 'сессии нет' }"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
