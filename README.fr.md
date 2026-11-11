# Dafiyu Control Center

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | **Français** | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

<p align="center">
  <b>Un panneau de contrôle Windows pour SnowLuma + qq-bridge + DeepSeek Harness.</b><br/>
  Pilotez, surveillez, révisez et sauvegardez un agent QQ auto-hébergé depuis une seule interface.
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest">
    <img alt="Dernière version" src="https://img.shields.io/github/v/release/taoshur/dafiyu-qq-desktop?label=release" />
  </a>
  <a href="LICENSE">
    <img alt="Licence : PolyForm Noncommercial 1.0.0" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-orange" />
  </a>
  <img alt="Plateforme : Windows 11 x64" src="https://img.shields.io/badge/platform-Windows%2011%20x64-blue" />
</p>

<p align="center">
  <a href="https://github.com/taoshur/dafiyu-qq-desktop/releases/latest"><b>Télécharger</b></a>
  ·
  <a href="#démarrage-rapide">Démarrage rapide</a>
  ·
  <a href="#fonctionnalités">Fonctionnalités</a>
  ·
  <a href="#licence">Licence</a>
</p>

---

## Présentation

Dafiyu Control Center est un **panneau de contrôle de bureau réservé à Windows** pour une pile d'agent QQ auto-hébergée.

```text
SnowLuma      runtime QQ / passerelle OneBot
qq-bridge     pont de messages, mémoire, outils, orchestration
DSH           DeepSeek Harness, hôte de l'agent
```

Ce projet ne remplace pas ces composants. Il ajoute :

- démarrage, arrêt et redémarrage contrôlés des services
- ports, journaux, état de santé et récupération
- consultation et révision de la mémoire long terme
- journal intime et évolution de la personnalité
- journal d'activité Bilibili
- sauvegardes SQLite cohérentes
- WebUI SnowLuma et console qq-bridge intégrées

L'interface est actuellement en chinois. Ce README sert aux utilisateurs et évaluateurs internationaux.

---

## Téléchargement

Version actuelle : **v1.2.1**

```text
Installer: Dafiyu-Control-Center-Setup.exe
Size:      153,091,291 bytes
SHA256:    DBDFC32B7D37242212BFAF0A6A034A3060784DEBF0BD660C2E8D8D78E592BEDA
```

L'installateur n'est pas signé. Windows SmartScreen peut afficher un avertissement.

---

## Contenu de l'installateur

Inclus :

- Dafiyu Control Center
- source de qq-bridge
- runtime SnowLuma 2.4.0 (`index.mjs`, `client`, `native`, `node.exe`, EULA/PRIVACY)

Non inclus :

- DeepSeek Harness (DSH)
- `config/`, `data/` et `logs/` de SnowLuma
- session QQ, cookies ou identifiants
- `config.json`, `state/` ou `roles/` de qq-bridge

Au premier lancement, si `~/SnowLuma` ne contient pas de runtime, le gestionnaire copie le runtime inclus. Un dossier SnowLuma existant n'est pas écrasé.

Le runtime SnowLuma est inclus avec une autorisation distincte de SnowLumaDevs. SnowLuma reste soumis à son EULA / Source-Available Non-Commercial License.

---

## Démarrage rapide

1. Installez le gestionnaire avec le dernier installateur.
2. Installez et connectez DSH séparément.
3. Démarrez SnowLuma et ouvrez `http://127.0.0.1:5099` pour la configuration initiale et la connexion QQ.
4. Dans le gestionnaire, renseignez `ownerQQ`, les conversations autorisées et les paramètres DSH / SnowLuma.
5. Démarrez dans l'ordre : `SnowLuma → DSH → qq-bridge`.

La source de qq-bridge est incluse, mais `npm install` peut être nécessaire lors de l'initialisation.

---

## Fonctionnalités

- Contrôle et récupération des services
- Mémoire long terme (facts / events / candidates)
- Édition, suppression logique, restauration et audit de la mémoire
- Révision des candidats d'évolution de la personnalité
- Journal intime
- Approbation automatique sécurisée des demandes d'ami
- Surveillance, likes et commentaires QQ Space
- Journal d'activité Bilibili
- Stickers, voix et chant
- Contrôle d'un émulateur Android (optionnel)
- Thèmes sombre / clair / système
- Assistant de premier lancement et guide interactif

---

## Compatibilité

- Windows 11 x64
- SnowLuma 2.x
- source qq-bridge incluse
- DSH installé séparément
- Node.js requis pour initialiser les dépendances de qq-bridge

### Mise à jour de SnowLuma

Le dépôt amont SnowLuma est désormais fermé. Le gestionnaire ne vérifie plus les mises à jour SnowLuma.

L'installateur contient un runtime SnowLuma 2.4.0 fixe. Pour mettre à jour : arrêter les services, remplacer manuellement le runtime, puis conserver `config/` et `data/`.

Les mises à jour du composant qq-bridge restent disponibles.

---

## Mises à jour récentes

- **1.2.1** — runtime SnowLuma inclus ; suppression de la mise à jour en ligne d'un projet amont devenu fermé
- **1.1.11** — SnowLuma inclus dans l'installateur et déployé au premier lancement
- **1.1.4** — compatibilité des champs d'image DSH anciens/nouveaux
- **1.1.3** — révision des candidats de croissance ; expiration du déverrouillage de production
- **1.1.1** — création, édition, suppression logique, restauration et audit des faits/événements confirmés
- **1.0.11** — approbation sécurisée des demandes d'ami et liste blanche

## Matrice fonctionnelle détaillée

| Page / domaine | Fonction | Limite |
|---|---|---|
| Vue d'ensemble | ports/PID, chaîne QQ, compteurs Memory, intégrité DB, modèle, durée | affichage seul |
| Services | démarrage/arrêt/redémarrage SnowLuma → DSH → qq-bridge, propriété et reprise | contrôle réel désactivé par défaut ; seuls les processus lancés par le gestionnaire sont arrêtés |
| Pages de service | WebUI SnowLuma (5099) et console qq-bridge (3100) intégrées | loopback uniquement ; `WebContentsView` isolé |
| Premier lancement | assistant, titre du propriétaire, mot de passe bootstrap SnowLuma, prompt de déploiement | mot de passe transmis une fois par variable d'environnement, non stocké |
| Installation environnement | détection SnowLuma / qq-bridge / DSH, dépendances, chemins, ports, sources | runtime SnowLuma et source qq-bridge inclus ; DSH manuel |
| Démarrage et reprise | autostart connexion, autostart bot, reprise automatique, trois interrupteurs | tous désactivés par défaut ; aucune reprise d'instance externe |
| Journaux | tail en lecture seule, changement de source, suivi, copie de diagnostic | aucune suppression/troncature ; secrets masqués |
| Vérification environnement | Node, dossiers, config, dépendances, state inscriptible, ports | lecture seule ; pas de réparation automatique |
| Configuration | chemins, titre, contrôle/reprise, champs non secrets | jetons, cookies et clés API jamais renvoyés à l'UI |
| Mémoire long terme | facts/events/candidates, preuves, confiance, précision temporelle, qualité, revue, import MaiBot | production en lecture seule ; revue après déverrouillage ; import en candidats |
| Bilibili | recherche, tendances, classements, détails, sous-titres, commentaires, danmaku, non-lus, déduplication BV | lecture du JSONL local uniquement |
| Sauvegarde | snapshots SQLite `VACUUM INTO`, manifest/SHA256, exercice de restauration, rétention | ne supprime que les sauvegardes `desktop-*` de l'application |
| À propos | version, architecture, licences, chemins, mise à jour | aucune credential |

## Capacités qq-bridge / DSH

- **Fast path** — texte court vers un modèle compatible OpenAI ; média/outils vers DSH
- **Compatibilité image DSH** — nouveau DSH : `mediaType` ; ancien : `mimeType` ; nouvelle tentative après échec de validation
- **Journal intime** — `qq_diary_context` / `qq_diary_write`, sans horaire fixe, jamais envoyé automatiquement à QQ
- **Amis et liste blanche** — approbation sécurisée puis ajout immédiat à la liste blanche
- **Stickers** — synchronisation, collection, notes, envoi contextuel
- **Memory V3/V4** — ingestion, extraction par lots, filtres qualité, expansion de concepts, rappel multi-signal, archivage réversible
- **Évaluation mémoire** — `npm run eval:memory` (précision, ambiguïté, temps, personnes, multi-tours, événements absents)
- **Bilibili** — recherche, tendances, classements, détails, sous-titres, commentaires, danmaku, UP, favoris
- **QQ Space** — fils, likes, commentaires, réponses, publication, signature
- **Voix/chant** — bibliothèque, TTS, RVC ; désactivé par défaut, modèles/audio locaux requis
- **Émulateur Android** — capture, arbre UI, tap, swipe, texte, lancement/fermeture, adb contrôlé
- **Recherche web** — `web_search` / `web_fetch` en lecture seule

## Compatibilité image DSH

```text
Nouveau DSH : session/prompt image -> mediaType
Ancien DSH  : mimeType
```

Le pont envoie d'abord `mediaType` puis réessaie avec `mimeType` si la validation échoue sur un prompt contenant une image. Les messages texte ne sont pas affectés. Les outils MCP image utilisent toujours `mimeType`.

## Référence des outils MCP

L'activation réelle dépend de `socialV2.tools`, des réglages stickers/voix/RVC et de la configuration MCP. Vérifier `qq_get_prompt` → `enabledTools`.

**Lecture QQ**  
`qq_status`, `qq_list_groups`, `qq_get_group_members`, `qq_get_group_history`, `qq_get_prompt`, `qq_get_unread_messages`, `qq_get_recent_messages`, `qq_get_my_recent_messages`, `qq_get_message_detail`, `qq_get_active_members`, `qq_social_state`, `qq_get_forward_msg`, `qq_get_message_images`

**Envoi et interaction QQ**  
`qq_send_group_message`, `qq_send_private_message`, `qq_reply`, `qq_send_burst`, `qq_send_message`, `qq_send_poke`, `qq_send_image`, `qq_send_image_data`, `qq_set_poke_style`

**Réveil et lecture**  
`qq_mark_read`, `qq_set_wake_config`, `qq_wait_for_messages`

**Mémoire et slang**  
`qq_memory_append`, `qq_memory_query`, `qq_memory_remove`, `qq_memory_clear`, `qq_slang_query`, `qq_slang_submit`

**Journal**  
`qq_diary_context`, `qq_diary_write`

**Stickers**  
`qq_list_stickers`, `qq_get_sticker_image`, `qq_send_sticker`, `qq_collect_sticker`, `qq_sticker_note`, `qq_set_sticker_remark`

**Voix et chant**  
`qq_list_voices`, `qq_send_voice`, `qq_say`, `qq_sing`

**QQ Space et amis**  
`qq_qzone_feeds`, `qq_qzone_detail`, `qq_qzone_like`, `qq_qzone_comment`, `qq_qzone_reply`, `qq_qzone_images`, `qq_post_qzone`, `qq_set_signature`, `qq_handle_friend_request`, `qq_approve_friend_request`, `qq_whitelist_add`

**Dessin et hôte**  
`qq_draw`, `qq_get_self_image`, `snowluma_status`

**Android**  
`android_status`, `android_screenshot`, `android_ui`, `android_tap`, `android_swipe`, `android_key`, `android_batch`, `android_text`, `android_launch`, `android_close`, `android_packages`, `android_adb`, `android_listen`, `android_capture_share`

**Recherche web**  
`web_search`, `web_fetch`

**Bilibili lecture**  
`bili_check_credential`, `bili_search`, `bili_comments`, `bili_subtitle`, `bili_danmaku`, `bili_video_info`, `bili_crawl`, `bili_hot_videos`, `bili_hot_buzzwords`, `bili_weekly_hot`, `bili_rank`, `bili_video_zones`, `bili_user_info`, `bili_user_videos`, `bili_favorite_lists`, `bili_favorite_content`, `bili_unread_messages`, `bili_received_replies`, `bili_received_at_and_likes`

**Bilibili connexion/écriture/publication**  
`bili_login`, `bili_login_check`, `bili_reply`, `bili_send_dynamic`, `bili_upload_video`, `bili_upload_video_multi`, `bili_send_opus`, `bili_send_message`

Les écritures Bilibili exigent les identifiants de l'utilisateur ; les cookies ne sont ni inclus ni envoyés.

## Memory V3 + V4

```text
Messages QQ
  → ingestion qq-bridge
  → table messages (déduplication/curseur)
  → extraction par lots
  → candidats faits/événements
  → revue manuelle ou auto-revue optionnelle
  → facts / events
  → rappel multi-signal V4
  → contexte DSH avec budget de tokens
```

- extraction par lots et curseurs
- candidats en attente jusqu'à validation
- provenance, confiance, qualité et précision temporelle conservées
- idempotence via `dedupe_key` / `batch_key`
- `observeOnly=true` maintient la production en lecture seule sans auto-revue explicite
- les éditions manuelles posent `manual_override`
- suppression logique et audit récupérables
- sauvegardes `VACUUM INTO` + manifest/SHA256

Le rappel V4 combine messages récents, sujet, personnes, période, participants et mots-clés, puis reclasse par pertinence, confiance, importance, récence et activité.

## Configuration et données

| Composant | Chemin par défaut | Remarque |
|---|---|---|
| Gestionnaire | `%APPDATA%\dafiyu-desktop` | réglages, logs, DB de test |
| Config gestionnaire | `%APPDATA%\dafiyu-desktop\config\config.json` | chemins, thème, contrôle |
| qq-bridge | `C:\Users\<user>\qq-bridge` | source et runtime |
| Config qq-bridge | `<qq-bridge>\config.json` | configuration principale |
| État qq-bridge | `<qq-bridge>\state` | DB, logs, jetons |
| SnowLuma | `~/SnowLuma` | runtime, config, données, logs |
| Profil DSH | `%USERPROFILE%\.dsh\profiles\desktop` | géré via DSH |

Configuration minimale :

```text
ownerQQ
allow.private / allow.groups
dsh.baseUrl / dsh.authToken
snowluma.httpUrl / wsUrl / accessToken
agentPreset
socialV2.enabled
```

Ne pas committer jetons, cookies, clés API, état de connexion QQ ou mémoire de production.

## Développement et build

```powershell
npm install
npm start
npm run build
```

Avant de construire un installateur de release, placer le runtime officiel SnowLuma Windows dans `vendor/SnowLuma`. Ce dossier n'est pas commité ; l'installateur de release l'inclut.

L'installateur n'est pas signé ; SmartScreen peut avertir.

## Limites

- DSH doit être installé et configuré séparément
- La connexion QQ nécessite la WebUI SnowLuma et un QR code
- L'interface est actuellement en chinois
- SnowLuma n'a plus de mise à jour en ligne ; remplacement manuel
- Les outils Bilibili MCP et Android dépendent d'une configuration locale optionnelle
- Projet source-available non commercial, pas open source OSI

---

## Prérequis

- Windows 11 x64
- DSH installé et configuré séparément
- Un compte QQ pour la connexion SnowLuma
- Node.js 22+ pour initialiser les dépendances de qq-bridge
- Ports locaux 5099 / 3000 / 3001 / 3100 / 3080 disponibles

## Architecture

```text
Dafiyu Control Center (Electron)
  renderer (sandbox) → preload allowlist → main
  main: supervisor / health / recovery / backup / memory / logs / embed
        │
SnowLuma (5099 / 3000 / 3001)     qq-bridge / DSH (3100 / agent API)
```

- pas de Node, shell ou accès fichier arbitraire dans le renderer
- validation IPC, chemins et propriété des processus dans le main
- les instances externes sont seulement détectées
- la mémoire de production n'est jamais modifiée sans action explicite et audit

## Attribution SnowLuma

SnowLuma est développé par **SnowLumaDevs** :

- https://github.com/SnowLuma/SnowLuma
- License : https://github.com/SnowLuma/SnowLuma/blob/main/LICENSE
- EULA : https://github.com/SnowLuma/SnowLuma/blob/main/EULA.md

L'installateur Windows inclut le runtime non modifié SnowLuma 2.4.0. Le projet dispose d'une autorisation distincte de SnowLumaDevs pour cette distribution. SnowLuma reste soumis à son propre EULA / Source-Available Non-Commercial License. Conservez l'attribution SnowLumaDevs, les liens officiels et les textes de licence complets lors de la redistribution.

---

## Licence

Le code de ce projet est publié sous **PolyForm Noncommercial License 1.0.0** :

- usage non commercial uniquement
- apprentissage, recherche, auto-hébergement non commercial et modification autorisés
- usage commercial, hébergement payant ou intégration dans un produit commercial interdits
- licence source-available / noncommercial, pas une licence open source OSI

Voir [LICENSE](LICENSE).

- qq-bridge est sous MIT ; sa notice est conservée dans [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- SnowLuma reste soumis à son propre EULA / Source-Available Non-Commercial License.
- DSH, les ressources de personnage et les autres dépendances ne sont pas couverts par la licence de ce projet.

---

## Liens

- [Dernière version](https://github.com/taoshur/dafiyu-qq-desktop/releases/latest)
- [Issues](https://github.com/taoshur/dafiyu-qq-desktop/issues)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)
- [English README](README.md)
- [中文 README](README.zh-CN.md)
