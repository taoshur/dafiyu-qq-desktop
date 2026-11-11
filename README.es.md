# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | **Español** | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

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
