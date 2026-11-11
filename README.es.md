# Dafiyu Control Center

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | **Español** | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <b>Un panel de control de escritorio para SnowLuma + qq-bridge + DeepSeek Harness en Windows.</b><br/>
  Ejecuta, supervisa, revisa y respalda un agente QQ autoalojado desde un solo lugar.
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Última versión" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="Licencia: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Plataforma: Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>Descargar</b></a>
  ·
  <a href="#inicio-rápido">Inicio rápido</a>
  ·
  <a href="#funciones">Funciones</a>
  ·
  <a href="#licencia">Licencia</a>
</p>

---

## Qué es

Dafiyu Control Center es un **panel de control de escritorio solo para Windows** para un agente QQ autoalojado.

```text
SnowLuma      runtime de QQ / pasarela OneBot
qq-bridge     mensajes, memoria, herramientas y orquestación
DSH           DeepSeek Harness, host del agente
```

No sustituye esos componentes. Añade:

- inicio, parada y reinicio controlados de servicios
- puertos, registros, estado y recuperación
- consulta y revisión de memoria a largo plazo
- diario y evolución de personalidad
- registro de actividad de Bilibili
- copias de seguridad SQLite coherentes
- WebUI de SnowLuma y consola de qq-bridge integradas

La interfaz está actualmente en chino. Este README es para usuarios y revisores internacionales.

---

## Descarga

Versión actual: **v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

El instalador no está firmado. Windows SmartScreen puede mostrar una advertencia.

---

## Contenido del instalador

Incluye:

- Dafiyu Control Center
- código fuente de qq-bridge
- runtime SnowLuma 2.4.0 (`index.mjs`, `client`, `native`, `node.exe`, EULA/PRIVACY)

No incluye:

- DeepSeek Harness (DSH)
- `config/`, `data/` ni `logs/` de SnowLuma
- sesión de QQ, cookies o credenciales
- `config.json`, `state/` ni `roles/` de qq-bridge

En el primer inicio, si `~/SnowLuma` no contiene un runtime, el gestor copia el incluido. Un directorio SnowLuma existente no se sobrescribe.

El runtime SnowLuma se incluye con un permiso separado de SnowLumaDevs. SnowLuma sigue sujeto a su EULA / Source-Available Non-Commercial License.

---

## Inicio rápido

1. Instala el gestor con el último instalador.
2. Instala e inicia sesión en DSH por separado.
3. Inicia SnowLuma y abre `http://127.0.0.1:5099` para la configuración inicial y el inicio de sesión de QQ.
4. En el gestor, configura `ownerQQ`, las conversaciones permitidas y los datos de DSH / SnowLuma.
5. Inicia en orden: `SnowLuma → DSH → qq-bridge`.

El código de qq-bridge está incluido, pero puede ser necesario `npm install` durante la inicialización.

---

## Funciones

- Control y recuperación de servicios
- Memoria a largo plazo (facts / events / candidates)
- Edición, borrado lógico, restauración y auditoría de memoria
- Revisión de candidatos de evolución de personalidad
- Diario
- Aprobación automática segura de solicitudes de amistad
- Observación de QQ Space, me gusta y comentarios
- Registro de actividad de Bilibili
- Stickers, voz y canto
- Control de emulador Android (opcional)
- Tema oscuro / claro / sistema
- Asistente de primer inicio y guía interactiva

---

## Compatibilidad

- Windows 11 x64
- SnowLuma 2.x
- código fuente de qq-bridge incluido
- DSH instalado por separado
- Node.js necesario para inicializar dependencias de qq-bridge

### Actualización de SnowLuma

El repositorio upstream de SnowLuma ahora es de código cerrado. El gestor ya no comprueba actualizaciones de SnowLuma.

El instalador incluye un runtime fijo SnowLuma 2.4.0. Para actualizar, detén los servicios, reemplaza manualmente el runtime y conserva `config/` y `data/`.

Las actualizaciones del componente qq-bridge siguen disponibles.

---

## Actualizaciones recientes

- **1.2.1** — runtime SnowLuma incluido; eliminada la actualización online del upstream cerrado
- **1.1.11** — SnowLuma incluido en el instalador y desplegado al primer inicio
- **1.1.4** — compatibilidad de campos de imagen DSH antiguo/nuevo
- **1.1.3** — revisión de candidatos de crecimiento; corrección de expiración de desbloqueo de producción
- **1.1.1** — creación, edición, borrado lógico, restauración y auditoría de hechos/eventos confirmados
- **1.0.11** — aprobación segura de solicitudes de amistad y lista blanca

## Matriz detallada de funciones

| Página / área | Qué hace | Límite |
|---|---|---|
| Resumen | puertos/PID, cadena QQ, contadores Memory, integridad DB, modelo, uptime | solo visualización |
| Servicios | inicio/parada/reinicio SnowLuma → DSH → qq-bridge, propiedad y recuperación | control real desactivado por defecto; solo procesos del gestor |
| Páginas de servicio | WebUI SnowLuma (5099) y consola qq-bridge (3100) integradas | solo loopback; `WebContentsView` aislado |
| Primer inicio | asistente, nombre del propietario, bootstrap SnowLuma, prompt de despliegue | contraseña una vez por variable de entorno, no se guarda |
| Instalación de entorno | detección SnowLuma / qq-bridge / DSH, dependencias, rutas, puertos | runtime SnowLuma y código qq-bridge incluidos; DSH manual |
| Inicio y recuperación | autostart de sesión, autostart del bot, recuperación automática, tres interruptores | todos desactivados; no se toman instancias externas |
| Registros | tail de solo lectura, cambio de fuente, seguimiento, copia de diagnóstico | sin borrado/truncado; secretos ocultos |
| Comprobación de entorno | Node, carpetas, configuración, dependencias, state escribible, puertos | solo lectura; sin reparación automática |
| Configuración | rutas, nombre, control/recuperación, campos no secretos | tokens, cookies y API keys nunca vuelven a la UI |
| Memoria a largo plazo | facts/events/candidates, evidencia, confianza, precisión temporal, calidad, revisión, importación MaiBot | producción read-only; revisión tras desbloqueo; importación solo candidatos |
| Bilibili | búsqueda, tendencias, rankings, detalles, subtítulos, comentarios, danmaku, no leídos, deduplicación BV | solo JSONL local |
| Copias de seguridad | snapshots SQLite `VACUUM INTO`, manifest/SHA256, simulacro, retención | solo elimina copias `desktop-*` de esta app |
| Acerca de | versión, arquitectura, licencias, rutas, actualización | sin credenciales |

## Capacidades qq-bridge / DSH

- **Fast path** — texto corto a un modelo compatible con OpenAI; multimedia/herramientas a DSH
- **Compatibilidad de imagen DSH** — DSH nuevo: `mediaType`; antiguo: `mimeType`; reintento tras fallo de validación
- **Diario** — `qq_diary_context` / `qq_diary_write`, sin horario fijo, nunca se envía solo a QQ
- **Amigos y lista blanca** — aprobación segura y alta inmediata
- **Stickers** — sincronización, colección, notas, envío contextual
- **Memory V3/V4** — ingesta, extracción por lotes, filtros de calidad, expansión de conceptos, recall multi-señal, archivo reversible
- **Evaluación de memoria** — `npm run eval:memory` (precisión, ambigüedad, tiempo, personas, multi-turno, eventos ausentes)
- **Bilibili** — búsqueda, tendencias, rankings, detalles, subtítulos, comentarios, danmaku, UP, favoritos
- **QQ Space** — feeds, likes, comentarios, respuestas, publicación, firma
- **Voz/canto** — biblioteca, TTS, RVC; desactivado, requiere modelos/audio locales
- **Emulador Android** — captura, árbol UI, tap, swipe, texto, abrir/cerrar apps, adb controlado
- **Búsqueda web** — `web_search` / `web_fetch` de solo lectura

## Compatibilidad de imagen DSH

```text
DSH nuevo : session/prompt image -> mediaType
DSH antiguo: mimeType
```

El puente envía primero `mediaType` y reintenta con `mimeType` si un prompt con imagen devuelve `input-invalid` / `boundary validation`. Los mensajes de solo texto no se ven afectados. Las herramientas MCP de imagen siguen usando `mimeType`.

## Referencia de herramientas MCP

La disponibilidad real depende de `socialV2.tools`, ajustes de stickers/voz/RVC y la configuración MCP. Consulta `qq_get_prompt` → `enabledTools`.

**Lectura QQ**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**Envío e interacción QQ**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**Despertar y lectura**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**Memoria y slang**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**Diario**  
`qq_diary_context`, `qq_diary_write`

**Stickers**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**Voz y canto**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ Space y amigos**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**Dibujo y host**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Búsqueda web**  
`web_search`, `web_fetch`

**Bilibili lectura**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili inicio/escritura/publicación**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Las escrituras de Bilibili requieren credenciales propias; las cookies no se incluyen ni se envían.

## Memory V3 + V4

```text
Mensajes QQ
  → ingesta qq-bridge
  → tabla messages (deduplicación/cursor)
  → extracción por lotes
  → candidatos de hechos/eventos
  → revisión manual o auto-revisión opcional
  → facts / events
  → recall multi-señal V4
  → contexto DSH con presupuesto de tokens
```

- extracción por lotes y cursores
- candidatos pendientes hasta revisión
- procedencia, confianza, calidad y precisión temporal
- idempotencia con `dedupe_key` / `batch_key`
- `observeOnly=true` mantiene producción read-only sin auto-revisión explícita
- las ediciones manuales establecen `manual_override`
- borrado lógico y auditoría recuperables
- backup `VACUUM INTO` + manifest/SHA256

El recall V4 combina mensajes recientes, tema, personas, rango temporal, participantes y palabras clave, y reordena por relevancia, confianza, importancia, recencia y actividad.

## Configuración y datos

| Componente | Ruta por defecto | Nota |
|---|---|---|
| Gestor | `%APPDATA%\dafiyu-desktop` | ajustes, logs, DB de prueba |
| Config del gestor | `%APPDATA%\dafiyu-desktop\config\config.json` | rutas, tema, control |
| qq-bridge | `C:\Users\<user>\qq-bridge` | código y runtime |
| Config qq-bridge | `<qq-bridge>\config.json` | configuración principal |
| State qq-bridge | `<qq-bridge>\state` | DB, logs, tokens |
| SnowLuma | `~/SnowLuma` | runtime, config, data, logs |
| DSH | `%USERPROFILE%\.dsh\profiles\desktop` | gestionado por DSH |

Configuración mínima:

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

No hagas commit de tokens, cookies, API keys, estado de QQ ni memoria de producción.

## Desarrollo y compilación

```powershell
npm install
npm start
npm run build
```

Antes de compilar un instalador de release, coloca el runtime oficial de SnowLuma Windows en `vendor/SnowLuma`. Ese directorio no se commitea; el instalador de release lo incluye.

El instalador no está firmado; SmartScreen puede avisar.

## Limitaciones

- DSH debe instalarse y configurarse por separado
- El inicio de sesión QQ requiere SnowLuma WebUI y QR
- La interfaz está actualmente en chino
- SnowLuma ya no tiene actualización online; reemplazo manual
- Bilibili MCP y Android dependen de configuración local opcional
- Proyecto source-available no comercial, no open source OSI

---

## Requisitos

- Windows 11 x64
- DSH instalado y configurado por separado
- Una cuenta QQ para el inicio de sesión de SnowLuma
- Node.js 22+ para inicializar dependencias de qq-bridge
- Puertos locales 5099 / 3000 / 3001 / 3100 / 3080 disponibles

## Arquitectura

```text
Dafiyu Control Center (Electron)
  renderer (sandbox) → preload allowlist → main
  main: supervisor / health / recovery / backup / memory / logs / embed
        │
SnowLuma (5099 / 3000 / 3001)     qq-bridge / DSH (3100 / agent API)
```

- el renderer no tiene Node, shell ni acceso arbitrario a archivos
- el main valida IPC, rutas y propiedad de procesos
- las instancias externas solo se detectan
- la memoria de producción no se modifica sin acción explícita y auditoría

## Atribución de SnowLuma

SnowLuma es desarrollado por **SnowLumaDevs**:

- https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

El instalador de Windows incluye el runtime SnowLuma 2.4.0 sin modificar. El proyecto tiene un permiso separado de SnowLumaDevs para esta distribución incluida. SnowLuma sigue sujeto a su propio EULA / Source-Available Non-Commercial License. Conserva la atribución de SnowLumaDevs, los enlaces oficiales y los textos completos de licencia al redistribuir.

---

## Licencia

El código de este proyecto se publica bajo **PolyForm Noncommercial License 1.0.0**:

- solo uso no comercial
- se permite aprendizaje personal, investigación, autoalojamiento no comercial y modificación
- prohibido el uso comercial, alojamiento de pago o inclusión en un producto comercial
- es una licencia source-available / noncommercial, no una licencia open source OSI

Consulta [LICENSE](LICENSE).

- qq-bridge usa MIT; su aviso se conserva en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- SnowLuma se rige por su propio EULA / Source-Available Non-Commercial License.
- DSH, los recursos del personaje y otras dependencias no están cubiertos por la licencia de este proyecto.

---

## Enlaces

- [Última versión](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [English README](README.md)
- [中文 README](README.zh-CN.md)
