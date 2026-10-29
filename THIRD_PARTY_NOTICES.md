# Third-Party Notices

## qq-bridge

This project is a derivative work /二次创作 based on:

- **qq-bridge**: https://github.com/Derpyu520/qq-bridge
- Copyright (c) 2026 Derpyu520 and qq-bridge / QSH contributors
- License: MIT (upstream `LICENSE`)

The upstream MIT notice is reproduced below:

```text
MIT License

Copyright (c) 2026 Derpyu520 and qq-bridge / QSH contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Upstream also lists third-party components (DSH, `@snowluma/*`, SnowLuma,
MCP SDK, etc.) that are **not** covered by qq-bridge's MIT license. Read the
upstream `LICENSE` and the respective projects' licenses before use.

## SnowLuma

- Upstream: https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md
- This repository does **not** bundle SnowLuma source or native binaries.
- SnowLumaDevs granted written permission on 2026-10-29 for this project to:
  - publish publicly on a non-commercial basis;
  - let users actively start/stop their own unmodified official SnowLuma installation;
  - embed access to the local SnowLuma WebUI.
- The permission does **not** cover modifying, packaging, or redistributing
  SnowLuma/native components, nor commercial use. SnowLuma remains under its own
  LICENSE/EULA; this project's license does not override it.

## DeepSeek Harness (DSH)

- Upstream: https://github.com/deepseek-ai/deepseek-harness
- This repository does not bundle DSH; it is an external application.
- Refer to the upstream repository/package licenses.

## Electron / electron-builder

- Electron: MIT
- electron-builder: MIT
- See `node_modules` package licenses for transitive dependencies.

## Artwork

`deepseek-chan.png`, `src/renderer/assets/deepseek-chan.png`, and
`build/icon.ico` use the Dafiyu project character artwork. The project owner
states that this artwork is publicly usable for this project and does not
infringe third-party rights. They are not covered by the source-code license;
downstream users should not assume a separate right to reuse the character in
unrelated products.
