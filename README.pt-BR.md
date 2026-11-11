# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Français](README.fr.md) | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | **Português**

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
