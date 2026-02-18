# ScanFactory

Plateforme de numérisation et de traitement OCR de documents médicaux pour les mutuelles et organismes de santé.

[![CI](https://github.com/devfactory-ai/scanfactory/actions/workflows/ci.yml/badge.svg)](https://github.com/devfactory-ai/scanfactory/actions/workflows/ci.yml)
[![Deploy](https://github.com/devfactory-ai/scanfactory/actions/workflows/deploy.yml/badge.svg)](https://github.com/devfactory-ai/scanfactory/actions/workflows/deploy.yml)

## Aperçu

ScanFactory est une solution complète pour :
- **Scanner** des documents (bulletins de soins, factures, ordonnances) via mobile ou web
- **Extraire** automatiquement les données avec OCR et IA
- **Valider** les données extraites avec une interface de correction
- **Exporter** les données validées vers les systèmes tiers

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clients                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│   Mobile App    │    Web App      │       API Directe           │
│   (Expo/RN)     │   (React/Vite)  │       (REST)                │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         └─────────────────┼───────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Cloudflare Edge                               │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │   Workers    │  │    Pages     │  │       R2 Storage     │   │
│  │   (API)      │  │    (Web)     │  │   (Scans/Exports)    │   │
│  └──────┬───────┘  └──────────────┘  └──────────────────────┘   │
│         │                                                        │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  D1 Database │  │  KV Cache    │  │    Workers AI        │   │
│  │  (SQLite)    │  │  (Sessions)  │  │   (Extraction LLM)   │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│                    Modal (OCR Service)                           │
├──────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ PaddleOCR   │  │  SuryaOCR   │  │ HunyuanOCR  │              │
│  │   (CPU)     │  │   (GPU)     │  │   (GPU)     │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description | Technologies |
|---------|-------------|--------------|
| `packages/api` | API REST backend | Hono, Cloudflare Workers, D1 |
| `packages/web` | Application web de validation | React, Vite, TailwindCSS |
| `packages/mobile` | Application mobile de scan | Expo, React Native |
| `packages/scan-lib` | Bibliothèque de scan partagée | TypeScript, Tesseract.js |
| `packages/modal-ocr` | Service OCR multi-moteurs | Python, Modal, PaddleOCR, SuryaOCR |

## Fonctionnalités

### Scan & Capture
- Détection automatique des bords du document
- Correction de perspective en temps réel
- Analyse de qualité (flou, éclairage, stabilité)
- Capture automatique quand le document est stable

### Extraction OCR
- OCR local avec Tesseract.js (hors-ligne)
- OCR distant avec API Claude/GPT (haute précision)
- Extraction structurée des champs (date, montant, patient, etc.)
- Support multi-langues (français, anglais)

### Validation
- Interface split-view (scan + formulaire)
- Navigation clavier entre documents
- Mises à jour optimistes
- Détection d'anomalies automatique

### Gestion des lots
- Regroupement automatique par période/type
- Workflow de validation : ouvert → fermé → vérifié → exporté
- Export vers formats standards (CSV, JSON, PDF)

## Démarrage Rapide

### Prérequis

- Node.js 20+
- npm 10+
- Compte Cloudflare (pour le déploiement)

### Installation

```bash
# Cloner le dépôt
git clone https://github.com/devfactory-ai/scanfactory.git
cd scanfactory

# Installer les dépendances
npm install

# Copier les fichiers d'environnement
cp packages/web/.env.example packages/web/.env.local
```

### Développement Local

```bash
# Terminal 1 - API (port 8787)
cd packages/api
npm run dev

# Terminal 2 - Web (port 5173)
cd packages/web
npm run dev

# Terminal 3 - Mobile (Expo)
cd packages/mobile
npm run start
```

### URLs de développement

| Service | URL |
|---------|-----|
| API | http://localhost:8787 |
| Web | http://localhost:5173 |
| Mobile | Expo Go sur votre appareil |

## Déploiement

### Production

```bash
# Créer l'infrastructure Cloudflare
./scripts/setup-cloudflare.sh production

# Déployer
./scripts/deploy.sh production all
```

### URLs de Production

| Service | URL |
|---------|-----|
| API | https://scanfactory-api.moka-598.workers.dev |
| Web | https://scanfactory-web.pages.dev |
| OCR (Modal) | https://devfactory-ai--scanfactory-ocr-health.modal.run |

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) pour le guide complet.

## Documentation

| Document | Description |
|----------|-------------|
| [INSTALLATION.md](docs/INSTALLATION.md) | Guide d'installation |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Guide de déploiement Cloudflare + Modal |
| [API.md](docs/API.md) | Documentation de l'API REST |
| [MODAL-OCR.md](docs/MODAL-OCR.md) | Service OCR multi-moteurs |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | Architecture technique détaillée |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | Guide de contribution |

## Scripts

```bash
# Développement
npm run dev              # Lancer tous les services en développement

# Tests
npm run test             # Lancer tous les tests
npm run test:coverage    # Tests avec couverture

# Build
npm run build            # Build de production

# Déploiement
./scripts/deploy.sh staging all      # Déployer en staging
./scripts/deploy.sh production all   # Déployer en production

# Base de données
npm run db:migrate       # Appliquer les migrations
npm run db:seed          # Insérer les données de test
```

## Variables d'Environnement

### API (wrangler.toml)

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Clé secrète pour les JWT (secret) |
| `OCR_API_KEY` | Clé API pour le service OCR distant (secret) |
| `CORS_ORIGIN` | Origine autorisée pour CORS |
| `OCR_API_URL` | URL de l'API OCR |

### Web (.env)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | URL de l'API backend |
| `VITE_ENVIRONMENT` | Environnement (development/staging/production) |

## Structure du Projet

```
scanfactory/
├── packages/
│   ├── api/                    # Backend API (Cloudflare Workers)
│   │   ├── src/
│   │   │   ├── auth/          # Authentification OTP
│   │   │   ├── core/          # Logique métier
│   │   │   │   ├── extraction/
│   │   │   │   ├── validation/
│   │   │   │   └── batches/
│   │   │   ├── middleware/    # CORS, Auth, Logging
│   │   │   ├── lib/           # Utilitaires
│   │   │   └── db/            # Schéma et migrations
│   │   └── wrangler.toml
│   │
│   ├── web/                   # Frontend React (Cloudflare Pages)
│   │   ├── src/
│   │   │   ├── components/    # Composants UI
│   │   │   ├── pages/         # Pages de l'app
│   │   │   ├── hooks/         # Hooks personnalisés
│   │   │   └── lib/           # API client, utils
│   │   └── vite.config.ts
│   │
│   ├── mobile/                # App Expo (React Native)
│   │   └── src/
│   │       ├── screens/
│   │       └── components/
│   │
│   ├── scan-lib/              # Bibliothèque partagée
│   │   └── src/
│   │       ├── scanner/       # Détection d'edges
│   │       ├── processor/     # Traitement d'image
│   │       └── ocr/           # Adaptateurs OCR
│   │
│   └── modal-ocr/             # Service OCR Multi-moteurs (Modal)
│       ├── app.py             # Modal application
│       ├── main.py            # CLI entry point
│       ├── config/            # Configuration YAML
│       ├── core/              # Strategy pattern, factory
│       ├── engines/           # PaddleOCR, SuryaOCR, HunyuanOCR...
│       ├── utils/             # Hardware detection, converters
│       ├── tests/             # Tests unitaires
│       ├── requirements/      # Dépendances Python
│       ├── Dockerfile
│       └── docker-compose.yml
│
├── scripts/                   # Scripts de déploiement
├── docs/                      # Documentation
└── .github/workflows/         # CI/CD
```

## Licence

Propriétaire - DevFactory © 2024
