# Dafiyu Control Center

**English** | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | **Français** | [Русский](README.ru.md) | [Español](README.es.md) | [Deutsch](README.de.md) | [Português](README.pt-BR.md)

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
