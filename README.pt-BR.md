# Dafiyu Control Center

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | **Português**

<p align="center">
  <b>Um painel de controle para SnowLuma + qq-bridge + DeepSeek Harness no Windows.</b><br/>
  Execute, monitore, revise e faça backup de um agente QQ auto-hospedado em um só lugar.
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Última versão" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="Licença: PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Plataforma: Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>Baixar</b></a>
  ·
  <a href="#início-rápido">Início rápido</a>
  ·
  <a href="#recursos">Recursos</a>
  ·
  <a href="#licença">Licença</a>
</p>

---

## O que é

Dafiyu Control Center é um **painel de controle de desktop somente para Windows** para um agente QQ auto-hospedado.

```text
SnowLuma      runtime de QQ / gateway OneBot
qq-bridge     mensagens, memória, ferramentas e orquestração
DSH           DeepSeek Harness, host do agente
```

Ele não substitui esses componentes. Adiciona:

- início, parada e reinício controlados de serviços
- portas, logs, integridade e recuperação
- consulta e revisão da memória de longo prazo
- diário e evolução de personalidade
- registro de atividades do Bilibili
- backups consistentes de SQLite
- WebUI do SnowLuma e console do qq-bridge integrados

A interface está atualmente em chinês. Este README é para usuários e avaliadores internacionais.

---

## Download

Versão atual: **v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

O instalador não é assinado. O Windows SmartScreen pode exibir um aviso.

---

## Conteúdo do instalador

Inclui:

- Dafiyu Control Center
- código-fonte do qq-bridge
- runtime SnowLuma 2.4.0 (`index.mjs`, `client`, `native`, `node.exe`, EULA/PRIVACY)

Não inclui:

- DeepSeek Harness (DSH)
- `config/`, `data/` ou `logs/` do SnowLuma
- sessão do QQ, cookies ou credenciais
- `config.json`, `state/` ou `roles/` do qq-bridge

No primeiro início, se `~/SnowLuma` não tiver um runtime, o gerenciador copia o runtime incluído. Uma pasta SnowLuma existente não é sobrescrita.

O runtime SnowLuma é incluído com uma permissão separada da SnowLumaDevs. O SnowLuma continua sujeito ao seu próprio EULA / Source-Available Non-Commercial License.

---

## Início rápido

1. Instale o gerenciador com o instalador mais recente.
2. Instale e faça login no DSH separadamente.
3. Inicie o SnowLuma e abra `http://127.0.0.1:5099` para a configuração inicial e login do QQ.
4. No gerenciador, configure `ownerQQ`, conversas permitidas e dados de DSH / SnowLuma.
5. Inicie na ordem: `SnowLuma → DSH → qq-bridge`.

O código do qq-bridge está incluído, mas `npm install` pode ser necessário na inicialização.

---

## Recursos

- Controle e recuperação de serviços
- Memória de longo prazo (facts / events / candidates)
- Edição, exclusão lógica, restauração e auditoria de memória
- Revisão de candidatos de evolução de personalidade
- Diário
- Aprovação automática segura de pedidos de amizade
- Monitoramento do QQ Space, curtidas e comentários
- Registro de atividades do Bilibili
- Figurinhas, voz e canto
- Controle de emulador Android (opcional)
- Tema escuro / claro / sistema
- Assistente de primeiro início e tour interativo

---

## Compatibilidade

- Windows 11 x64
- SnowLuma 2.x
- código-fonte do qq-bridge incluído
- DSH instalado separadamente
- Node.js necessário para inicializar dependências do qq-bridge

### Atualização do SnowLuma

O repositório upstream do SnowLuma agora é closed source. O gerenciador não verifica mais atualizações do SnowLuma.

O instalador inclui um runtime fixo SnowLuma 2.4.0. Para atualizar, pare os serviços, substitua o runtime manualmente e preserve `config/` e `data/`.

Atualizações do componente qq-bridge continuam disponíveis.

---

## Atualizações recentes

- **1.2.1** — runtime SnowLuma incluído; atualização online removida após o upstream fechar o código
- **1.1.11** — SnowLuma incluído no instalador e implantado no primeiro início
- **1.1.4** — compatibilidade de campos de imagem DSH antigo/novo
- **1.1.3** — revisão de candidatos de crescimento; correção de expiração do desbloqueio de produção
- **1.1.1** — criação, edição, exclusão lógica, restauração e auditoria de fatos/eventos confirmados
- **1.0.11** — aprovação segura de solicitações de amizade e lista de permissões

## Matriz detalhada de recursos

| Página / área | O que faz | Limite |
|---|---|---|
| Visão geral | portas/PIDs, cadeia QQ, contadores Memory, integridade DB, modelo, uptime | apenas exibição |
| Serviços | iniciar/parar/reiniciar SnowLuma → DSH → qq-bridge, propriedade e recuperação | controle real desativado por padrão; só processos do gerenciador |
| Páginas de serviço | WebUI SnowLuma (5099) e console qq-bridge (3100) integrados | apenas loopback; `WebContentsView` isolado |
| Primeiro início | assistente, nome do proprietário, bootstrap SnowLuma, prompt de implantação | senha uma vez por variável de ambiente, não salva |
| Instalação do ambiente | detecção SnowLuma / qq-bridge / DSH, dependências, caminhos, portas | runtime SnowLuma e código qq-bridge incluídos; DSH manual |
| Início e recuperação | autostart de login, autostart do bot, recuperação automática, três chaves | todas desligadas; instâncias externas não são assumidas |
| Logs | tail somente leitura, troca de fonte, acompanhamento, cópia de diagnóstico | sem exclusão/truncamento; segredos mascarados |
| Verificação de ambiente | Node, diretórios, config, dependências, state gravável, portas | somente leitura; sem reparo automático |
| Configuração | caminhos, nome, controle/recuperação, campos não secretos | tokens, cookies e API keys nunca voltam à UI |
| Memória de longo prazo | facts/events/candidates, evidências, confiança, precisão temporal, qualidade, revisão, importação MaiBot | produção read-only; revisão após desbloqueio; importação só candidatos |
| Bilibili | busca, tendências, rankings, detalhes, legendas, comentários, danmaku, não lidos, dedupe BV | apenas JSONL local |
| Backups | snapshots SQLite `VACUUM INTO`, manifest/SHA256, treino de restauração, retenção | apaga apenas `desktop-*` deste app |
| Sobre | versão, arquitetura, licenças, caminhos, atualização | sem credenciais |

## Recursos qq-bridge / DSH

- **Fast path** — texto curto para modelo compatível com OpenAI; mídia/ferramentas para DSH
- **Compatibilidade de imagem DSH** — DSH novo: `mediaType`; antigo: `mimeType`; nova tentativa após falha de validação
- **Diário** — `qq_diary_context` / `qq_diary_write`, sem horário fixo, nunca enviado automaticamente ao QQ
- **Amigos e lista de permissões** — aprovação segura e inclusão imediata
- **Stickers** — sincronização, coleção, notas, envio contextual
- **Memory V3/V4** — ingestão, extração em lotes, filtros de qualidade, expansão de conceitos, recall multi-sinal, arquivamento reversível
- **Avaliação de memória** — `npm run eval:memory` (precisão, ambiguidade, tempo, pessoas, múltiplos turnos, eventos ausentes)
- **Bilibili** — busca, tendências, rankings, detalhes, legendas, comentários, danmaku, UP, favoritos
- **QQ Space** — feeds, curtidas, comentários, respostas, publicação, assinatura
- **Voz/canto** — biblioteca, TTS, RVC; desativado, exige modelos/áudio locais
- **Emulador Android** — captura, árvore UI, tap, swipe, texto, abrir/fechar apps, adb controlado
- **Busca web** — `web_search` / `web_fetch` somente leitura

## Compatibilidade de imagem DSH

```text
DSH novo : session/prompt image -> mediaType
DSH antigo: mimeType
```

A ponte envia `mediaType` primeiro e tenta novamente com `mimeType` quando um prompt com imagem retorna `input-invalid` / `boundary validation`. Mensagens só de texto não são afetadas. Ferramentas MCP de imagem continuam usando `mimeType`.

## Referência de ferramentas MCP

A disponibilidade real depende de `socialV2.tools`, ajustes de stickers/voz/RVC e configuração MCP. Consulte `qq_get_prompt` → `enabledTools`.

**Leitura QQ**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**Envio e interação QQ**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**Despertar e leitura**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**Memória e slang**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**Diário**  
`qq_diary_context`, `qq_diary_write`

**Stickers**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**Voz e canto**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ Space e amigos**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**Desenho e host**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Busca web**  
`web_search`, `web_fetch`

**Bilibili leitura**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili login/escrita/publicação**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Escritas no Bilibili exigem credenciais do usuário; cookies não são incluídos nem enviados.

## Memory V3 + V4

```text
Mensagens QQ
  → ingestão qq-bridge
  → tabela messages (dedupe/cursor)
  → extração em lotes
  → candidatos de fatos/eventos
  → revisão manual ou auto-revisão opcional
  → facts / events
  → recall multi-sinal V4
  → contexto DSH com orçamento de tokens
```

- extração em lotes e cursores
- candidatos pendentes até revisão
- procedência, confiança, qualidade e precisão temporal
- idempotência via `dedupe_key` / `batch_key`
- `observeOnly=true` mantém produção read-only sem auto-revisão explícita
- edições manuais definem `manual_override`
- exclusão lógica e auditoria recuperáveis
- backup `VACUUM INTO` + manifest/SHA256

O recall V4 combina mensagens recentes, tópico, pessoas, período, participantes e palavras-chave, e reordena por relevância, confiança, importância, recência e atividade.

## Configuração e dados

| Componente | Caminho padrão | Observação |
|---|---|---|
| Gerenciador | `%APPDATA%\dafiyu-desktop` | ajustes, logs, DB de teste |
| Config do gerenciador | `%APPDATA%\dafiyu-desktop\config\config.json` | caminhos, tema, controle |
| qq-bridge | `C:\Users\<user>\qq-bridge` | código e runtime |
| Config qq-bridge | `<qq-bridge>\config.json` | configuração principal |
| State qq-bridge | `<qq-bridge>\state` | DB, logs, tokens |
| SnowLuma | `~/SnowLuma` | runtime, config, data, logs |
| DSH | `%USERPROFILE%\.dsh\profiles\desktop` | gerenciado pelo DSH |

Configuração mínima:

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

Não faça commit de tokens, cookies, API keys, estado de login do QQ ou memória de produção.

## Desenvolvimento e build

```powershell
npm install
npm start
npm run build
```

Antes de gerar um instalador de release, coloque o runtime oficial SnowLuma Windows em `vendor/SnowLuma`. Esse diretório não é commitado; o instalador de release o inclui.

O instalador não é assinado; o SmartScreen pode avisar.

## Limitações

- DSH precisa ser instalado e configurado separadamente
- O login do QQ exige SnowLuma WebUI e QR code
- A interface está atualmente em chinês
- SnowLuma não tem mais atualização online; substituição manual
- Bilibili MCP e Android dependem de configuração local opcional
- Projeto source-available não comercial, não é open source OSI

---

## Requisitos

- Windows 11 x64
- DSH instalado e configurado separadamente
- Uma conta QQ para o login do SnowLuma
- Node.js 22+ para inicializar dependências do qq-bridge
- Portas locais 5099 / 3000 / 3001 / 3100 / 3080 disponíveis

## Arquitetura

```text
Dafiyu Control Center (Electron)
  renderer (sandbox) → preload allowlist → main
  main: supervisor / health / recovery / backup / memory / logs / embed
        │
SnowLuma (5099 / 3000 / 3001)     qq-bridge / DSH (3100 / agent API)
```

- sem Node, shell ou acesso arbitrário a arquivos no renderer
- o main valida IPC, caminhos e propriedade dos processos
- instâncias externas são apenas detectadas
- a memória de produção não é alterada sem ação explícita e auditoria

## Atribuição do SnowLuma

SnowLuma é desenvolvido por **SnowLumaDevs**:

- https://github.com/SnowLuma/SnowLuma
- License: https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA: https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

O instalador do Windows inclui o runtime SnowLuma 2.4.0 sem modificações. O projeto tem permissão separada da SnowLumaDevs para esta distribuição integrada. O SnowLuma continua sujeito ao seu próprio EULA / Source-Available Non-Commercial License. Preserve a atribuição da SnowLumaDevs, os links oficiais e os textos completos das licenças ao redistribuir.

---

## Licença

O código deste projeto é publicado sob a **PolyForm Noncommercial License 1.0.0**:

- somente uso não comercial
- aprendizado pessoal, pesquisa, auto-hospedagem não comercial e modificação permitidos
- uso comercial, hospedagem paga ou inclusão em produto comercial proibidos
- é uma licença source-available / noncommercial, não uma licença open source OSI

Consulte [LICENSE](LICENSE).

- qq-bridge é MIT; o aviso é mantido em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- SnowLuma está sujeito ao seu próprio EULA / Source-Available Non-Commercial License.
- DSH, recursos do personagem e outras dependências não são cobertos pela licença deste projeto.

---

## Links

- [Última versão](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [English README](README.md)
- [中文 README](README.zh-CN.md)
