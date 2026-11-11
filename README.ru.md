# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | **Русский** | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

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
