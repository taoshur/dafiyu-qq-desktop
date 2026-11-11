# Dafiyu Control Center

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | **Русский** | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <b>Настольная панель управления для SnowLuma + qq-bridge + DeepSeek Harness в Windows.</b><br/>
  Запуск, мониторинг, проверка памяти и резервное копирование QQ-агента в одном месте.
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Последняя версия" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="Лицензия: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Платформа: Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>Скачать</b></a>
  ·
  <a href="#быстрый-старт">Быстрый старт</a>
  ·
  <a href="#возможности">Возможности</a>
  ·
  <a href="#лицензия">Лицензия</a>
</p>

---

## Что это

Dafiyu Control Center — это **настольная панель управления только для Windows** для самостоятельно размещённого QQ-агента.

```text
SnowLuma      среда QQ / шлюз OneBot
qq-bridge     обработка сообщений, память, инструменты, оркестрация
DSH           DeepSeek Harness, хост агента
```

Проект не заменяет эти компоненты. Он добавляет:

- управляемое завершение, запуск и перезапуск сервисов
- проверку портов, журналов, состояния и восстановления
- просмотр и проверку долговременной памяти
- дневник и развитие личности
- журнал активности Bilibili
- согласованные резервные копии SQLite
- встроенные WebUI SnowLuma и консоль qq-bridge

Интерфейс сейчас на китайском языке. Этот README предназначен для международных пользователей и проверяющих.

---

## Скачивание

Текущий релиз: **v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

Установщик не подписан. Windows SmartScreen может показать предупреждение.

---

## Что входит в установщик

Входит:

- Dafiyu Control Center
- исходный код qq-bridge
- среда SnowLuma 2.4.0 (`index.mjs`, `client`, `native`, `node.exe`, EULA/PRIVACY)

Не входит:

- DeepSeek Harness (DSH)
- `config/`, `data/`, `logs/` SnowLuma
- состояние входа QQ, cookie или учётные данные
- `config.json`, `state/`, `roles/` qq-bridge

При первом запуске, если в `~/SnowLuma` нет среды выполнения, менеджер копирует встроенную версию. Существующий каталог SnowLuma не перезаписывается.

Среда SnowLuma включена по отдельному разрешению SnowLumaDevs. На SnowLuma по-прежнему распространяется её EULA / Source-Available Non-Commercial License.

---

## Быстрый старт

1. Установите менеджер из последнего установщика.
2. Отдельно установите DSH и войдите в него.
3. Запустите SnowLuma и откройте `http://127.0.0.1:5099` для первичной настройки и входа в QQ.
4. В менеджере укажите `ownerQQ`, разрешённые чаты и параметры DSH / SnowLuma.
5. Запускайте по порядку: `SnowLuma → DSH → qq-bridge`.

Исходники qq-bridge включены, но при первичной инициализации может потребоваться `npm install`.

---

## Возможности

- Управление сервисами и восстановление
- Долговременная память (facts / events / candidates)
- Редактирование, мягкое удаление, восстановление и аудит памяти
- Проверка кандидатов развития личности
- Дневник
- Безопасное автоодобрение заявок в друзья
- Наблюдение за QQ Space, лайки и комментарии
- Журнал активности Bilibili
- Стикеры, голос и пение
- Управление эмулятором Android (опционально)
- Тёмная / светлая / системная тема
- Мастер первого запуска и интерактивное руководство

---

## Совместимость

- Windows 11 x64
- SnowLuma 2.x
- встроенный исходный код qq-bridge
- DSH устанавливается отдельно
- Node.js нужен для инициализации зависимостей qq-bridge

### Обновление SnowLuma

Репозиторий SnowLuma закрыт. Менеджер больше не проверяет обновления SnowLuma.

Установщик содержит фиксированную среду SnowLuma 2.4.0. Для обновления остановите сервисы, вручную замените среду выполнения и сохраните `config/` и `data/`.

Обновления компонента qq-bridge по-прежнему доступны.

---

## Последние обновления

- **1.2.1** — встроенная среда SnowLuma; удалено онлайн-обновление закрытого upstream
- **1.1.11** — SnowLuma включена в установщик и разворачивается при первом запуске
- **1.1.4** — совместимость полей изображения старых/новых DSH
- **1.1.3** — проверка кандидатов роста; исправление истечения разблокировки production
- **1.1.1** — создание, редактирование, мягкое удаление, восстановление и аудит подтверждённых фактов/событий
- **1.0.11** — безопасное автоодобрение заявок в друзья и белый список

## Подробная матрица функций

| Страница / область | Что делает | Граница |
|---|---|---|
| Обзор | порты/PID, цепочка QQ, счётчики Memory, целостность БД, модель, uptime | только отображение |
| Сервисы | запуск/остановка/перезапуск SnowLuma → DSH → qq-bridge, владение и восстановление | реальное управление выключено по умолчанию; останавливаются только процессы менеджера |
| Веб-сервисы | встроенные SnowLuma WebUI (5099) и консоль qq-bridge (3100) | только loopback; отдельный `WebContentsView` |
| Первый запуск | мастер, имя владельца, bootstrap-пароль SnowLuma, prompt развёртывания | пароль передаётся один раз через env и не сохраняется |
| Установка окружения | проверка SnowLuma / qq-bridge / DSH, зависимостей, путей, портов | среда SnowLuma и исходники qq-bridge включены; DSH вручную |
| Запуск и восстановление | автозапуск входа, автозапуск бота, авто-восстановление, три переключателя | все выключены; внешние экземпляры не перехватываются |
| Журналы | read-only tail, переключение источника, follow, копирование диагностики | без удаления/обрезки; секреты маскируются |
| Проверка окружения | Node, каталоги, конфиг, зависимости, запись state, порты | только чтение; без автоисправления |
| Конфигурация | пути, имя, управление/восстановление, несекретные поля | токены, cookies и API-ключи не возвращаются в UI |
| Долговременная память | facts/events/candidates, доказательства, уверенность, точность времени, качество, review, импорт MaiBot | production read-only; review после разблокировки; импорт только в кандидаты |
| Bilibili | поиск, тренды, рейтинги, детали, субтитры, комментарии, danmaku, непрочитанные, дедупликация BV | только локальный JSONL |
| Резервные копии | SQLite `VACUUM INTO`, manifest/SHA256, тренировка восстановления, хранение | удаляются только `desktop-*` этой программы |
| О программе | версия, архитектура, лицензии, пути, обновление | без учётных данных |

## Возможности qq-bridge / DSH

- **Fast path** — короткий текст в OpenAI-совместимую модель; сложное/медиа/инструменты в DSH
- **Совместимость изображений DSH** — новый DSH: `mediaType`; старый: `mimeType`; повтор при ошибке boundary validation
- **Дневник** — `qq_diary_context` / `qq_diary_write`, без расписания, не отправляется в QQ автоматически
- **Друзья и белый список** — безопасное одобрение и немедленное добавление
- **Стикеры** — синхронизация, коллекция, заметки, отправка по контексту
- **Memory V3/V4** — приём, пакетное извлечение, фильтры качества, расширение концептов, multi-signal recall, обратимое архивирование
- **Оценка памяти** — `npm run eval:memory` (точность, неоднозначность, время, люди, многоходовые, отсутствующие события)
- **Bilibili** — поиск, тренды, рейтинги, детали, субтитры, комментарии, danmaku, UP, избранное
- **QQ Space** — лента, лайки, комментарии, ответы, публикация, подпись
- **Голос/пение** — библиотека, TTS, RVC; выключено, нужны локальные модели/аудио
- **Android-эмулятор** — скриншот, UI-дерево, tap, swipe, текст, запуск/закрытие, контролируемый adb
- **Веб-поиск** — read-only `web_search` / `web_fetch`

## Совместимость изображений DSH

```text
Новый DSH : session/prompt image -> mediaType
Старый DSH: mimeType
```

Мост сначала отправляет `mediaType`, затем повторяет с `mimeType`, если валидация prompt с изображением возвращает `input-invalid` / `boundary validation`. Текстовые сообщения не затронуты. MCP-инструменты изображений по-прежнему используют `mimeType`.

## Справочник MCP-инструментов

Фактическая доступность зависит от `socialV2.tools`, настроек стикеров/голоса/RVC и MCP. Проверяйте `qq_get_prompt` → `enabledTools`.

**Чтение QQ**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**Отправка и взаимодействие QQ**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**Пробуждение и прочтение**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**Память и сленг**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**Дневник**  
`qq_diary_context`, `qq_diary_write`

**Стикеры**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**Голос и пение**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ Space и друзья**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**Рисование и хост**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Веб-поиск**  
`web_search`, `web_fetch`

**Bilibili чтение**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili вход/запись/публикация**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Для записи Bilibili нужны собственные учётные данные; cookies не включаются и не отправляются.

## Memory V3 + V4

```text
Сообщения QQ
  → приём qq-bridge
  → таблица messages (дедупликация/курсор)
  → пакетное извлечение
  → кандидаты фактов/событий
  → ручная или автоматическая проверка
  → facts / events
  → multi-signal recall V4
  → контекст DSH с бюджетом токенов
```

- пакетное извлечение и курсоры
- кандидаты ждут проверки
- сохраняются источник, уверенность, качество, точность времени
- идемпотентность через `dedupe_key` / `batch_key`
- `observeOnly=true` оставляет production read-only без явного auto-review
- ручные правки ставят `manual_override`
- мягкое удаление и аудит с восстановлением
- backup `VACUUM INTO` + manifest/SHA256

V4 recall объединяет недавние сообщения, тему, людей, период, участников и ключевые слова, затем переранжирует по релевантности, уверенности, важности, свежести и активности.

## Конфигурация и данные

| Компонент | Путь по умолчанию | Примечание |
|---|---|---|
| Менеджер | `%APPDATA%\dafiyu-desktop` | настройки, логи, тестовая БД |
| Конфиг менеджера | `%APPDATA%\dafiyu-desktop\config\config.json` | пути, тема, управление |
| qq-bridge | `C:\Users\<user>\qq-bridge` | исходники и runtime |
| Конфиг qq-bridge | `<qq-bridge>\config.json` | основная конфигурация |
| State qq-bridge | `<qq-bridge>\state` | БД, логи, токены |
| SnowLuma | `~/SnowLuma` | runtime, config, data, logs |
| DSH | `%USERPROFILE%\.dsh\profiles\desktop` | управляется через DSH |

Минимальная конфигурация:

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

Не коммитьте токены, cookies, API-ключи, состояние входа QQ или production-память.

## Разработка и сборка

```powershell
npm install
npm start
npm run build
```

Перед сборкой релизного установщика поместите официальный SnowLuma Windows runtime в `vendor/SnowLuma`. Каталог не коммитится; релизный установщик включает его.

Установщик не подписан; SmartScreen может предупредить.

## Ограничения

- DSH устанавливается и настраивается отдельно
- Для входа QQ нужен SnowLuma WebUI и QR-код
- Интерфейс сейчас на китайском
- Онлайн-обновление SnowLuma прекращено; замена вручную
- Bilibili MCP и Android зависят от локальной конфигурации
- Проект source-available noncommercial, не OSI open source

---

## Требования

- Windows 11 x64
- DSH установлен и настроен отдельно
- Аккаунт QQ для входа в SnowLuma
- Node.js 22+ для инициализации зависимостей qq-bridge
- Свободные локальные порты 5099 / 3000 / 3001 / 3100 / 3080

## Архитектура

```text
Dafiyu Control Center (Electron)
  renderer (sandbox) → preload allowlist → main
  main: supervisor / health / recovery / backup / memory / logs / embed
        │
SnowLuma (5099 / 3000 / 3001)     qq-bridge / DSH (3100 / agent API)
```

- в renderer нет Node, shell и произвольного доступа к файлам
- main проверяет IPC, пути и владение процессами
- внешние экземпляры только обнаруживаются
- production-память не меняется без явного действия и аудита

## Атрибуция SnowLuma

SnowLuma разрабатывается **SnowLumaDevs**:

- https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

Windows-установщик содержит неизменённую среду SnowLuma 2.4.0. Для такого bundled-распространения получено отдельное разрешение SnowLumaDevs. На SnowLuma по-прежнему распространяется её EULA / Source-Available Non-Commercial License. При повторном распространении сохраняйте атрибуцию SnowLumaDevs, официальные ссылки и полные тексты лицензий.

---

## Лицензия

Код этого проекта распространяется по **PolyForm Noncommercial License 1.0.0**:

- только некоммерческое использование
- личное обучение, исследование, некоммерческий self-hosting и изменение разрешены
- коммерческое использование, платный хостинг и включение в коммерческий продукт запрещены
- это source-available / noncommercial лицензия, а не OSI open source

См. [LICENSE](LICENSE).

- qq-bridge распространяется по MIT; уведомление сохранено в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- SnowLuma регулируется её собственным EULA / Source-Available Non-Commercial License.
- DSH, материалы персонажа и другие зависимости не покрываются лицензией проекта.

---

## Ссылки

- [Последний релиз](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [English README](README.md)
- [中文 README](README.zh-CN.md)
