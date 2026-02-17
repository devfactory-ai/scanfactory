# Guide d'Installation ScanFactory

Ce guide vous accompagne dans l'installation et la configuration de ScanFactory.

## Prérequis

### Logiciels requis

| Logiciel | Version | Vérification |
|----------|---------|--------------|
| Node.js | 20+ | `node --version` |
| npm | 10+ | `npm --version` |
| Git | 2.x | `git --version` |
| wrangler | 3.x+ | `npx wrangler --version` |

### Comptes requis

- **Cloudflare** (plan Workers Paid pour Queues)
- **Twilio** (pour l'envoi d'OTP par SMS) - optionnel en développement

## Installation Locale

### 1. Cloner le dépôt

```bash
git clone https://github.com/devfactory-ai/scanfactory.git
cd scanfactory
```

### 2. Installer les dépendances

```bash
npm install
```

Cela installe les dépendances de tous les packages (monorepo npm workspaces).

### 3. Configuration de l'API

```bash
cd packages/api
```

Le fichier `wrangler.toml` est déjà configuré pour le développement local. Pour tester localement avec une vraie base D1 :

```bash
# Créer une base locale
npx wrangler d1 create scanfactory-db-local

# Initialiser le schéma
npx wrangler d1 execute scanfactory-db-local --file=src/db/schema.sql --local
```

### 4. Configuration du Web

```bash
cd packages/web

# Copier le fichier d'environnement
cp .env.example .env.local
```

Éditer `.env.local` :
```env
VITE_API_URL=http://localhost:8787/api
VITE_ENVIRONMENT=development
```

### 5. Configuration Mobile (optionnel)

```bash
cd packages/mobile

# Installer Expo CLI globalement si nécessaire
npm install -g expo-cli

# Copier la configuration
cp app.config.example.js app.config.js
```

## Lancement en Développement

### Option A : Lancer chaque service séparément

```bash
# Terminal 1 - API
cd packages/api
npm run dev
# → http://localhost:8787

# Terminal 2 - Web
cd packages/web
npm run dev
# → http://localhost:5173

# Terminal 3 - Mobile (optionnel)
cd packages/mobile
npm run start
# → Ouvrir Expo Go sur votre appareil
```

### Option B : Utiliser un process manager

Avec `concurrently` (déjà installé) :

```bash
npm run dev
```

## Base de Données

### Schéma

Le schéma de la base de données est dans `packages/api/src/db/schema.sql`.

Tables principales :
- `users` - Utilisateurs et authentification
- `pipelines` - Configurations de pipelines OCR
- `documents` - Documents scannés
- `batches` - Lots de documents
- `audit_log` - Journal d'audit

### Migrations

Les migrations sont dans `packages/api/src/db/migrations/`.

```bash
# Appliquer une migration localement
npx wrangler d1 execute scanfactory-db --file=src/db/migrations/002_constraints_and_soft_delete.sql --local

# Appliquer en production
npx wrangler d1 execute scanfactory-db --file=src/db/migrations/002_constraints_and_soft_delete.sql --remote
```

### Données de test

```bash
# Insérer des données de test
npx wrangler d1 execute scanfactory-db --file=src/db/seed.sql --local
```

## Configuration Avancée

### Variables d'environnement API

| Variable | Description | Défaut |
|----------|-------------|--------|
| `ENVIRONMENT` | Environnement actuel | `development` |
| `CORS_ORIGIN` | Origines CORS autorisées | `http://localhost:5173` |
| `OCR_API_URL` | URL de l'API OCR | `https://ocr.devfactory.tn/api` |
| `LOG_LEVEL` | Niveau de log (debug, info, warn, error) | `debug` |

### Secrets (production)

```bash
# Configurer les secrets
npx wrangler secret put JWT_SECRET
npx wrangler secret put OCR_API_KEY
npx wrangler secret put TWILIO_ACCOUNT_SID
npx wrangler secret put TWILIO_AUTH_TOKEN
npx wrangler secret put TWILIO_PHONE_NUMBER
```

### Configuration Twilio (OTP)

Pour activer l'envoi d'OTP par SMS en développement :

1. Créer un compte Twilio (https://www.twilio.com)
2. Obtenir un numéro de téléphone
3. Configurer les secrets :

```bash
npx wrangler secret put TWILIO_ACCOUNT_SID
# Entrer votre Account SID

npx wrangler secret put TWILIO_AUTH_TOKEN
# Entrer votre Auth Token

npx wrangler secret put TWILIO_PHONE_NUMBER
# Entrer votre numéro (+33...)
```

### Mode développement sans Twilio

En développement, l'OTP est affiché dans les logs du serveur :

```
[DEV] OTP pour +33612345678: 123456
```

## Tests

### Lancer tous les tests

```bash
npm test
```

### Tests par package

```bash
# API
cd packages/api && npm test

# Web
cd packages/web && npm test

# scan-lib
cd packages/scan-lib && npm test
```

### Tests avec couverture

```bash
npm run test:coverage
```

## Résolution de Problèmes

### Port déjà utilisé

```bash
# Trouver le processus utilisant le port 8787
lsof -i :8787

# Tuer le processus
kill -9 <PID>
```

### Erreur "D1 database not found"

```bash
# Recréer la base locale
npx wrangler d1 create scanfactory-db-local

# Réinitialiser le schéma
npx wrangler d1 execute scanfactory-db-local --file=src/db/schema.sql --local
```

### Erreur CORS

Vérifier que `CORS_ORIGIN` dans `wrangler.toml` correspond exactement à l'URL du frontend (sans slash final).

### Erreur "Module not found"

```bash
# Nettoyer et réinstaller
rm -rf node_modules
rm -rf packages/*/node_modules
npm install
```

### Mobile : Erreur de connexion à l'API

1. S'assurer que l'API tourne sur le bon port
2. Utiliser l'IP locale au lieu de `localhost` :
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.1.x:8787/api
   ```
3. Vérifier que le téléphone est sur le même réseau

## Structure des Fichiers de Configuration

```
scanfactory/
├── package.json              # Monorepo root
├── packages/
│   ├── api/
│   │   ├── wrangler.toml    # Config Cloudflare Workers
│   │   ├── tsconfig.json    # Config TypeScript
│   │   └── package.json
│   ├── web/
│   │   ├── .env.local       # Variables d'environnement (ignoré git)
│   │   ├── .env.example     # Template
│   │   ├── vite.config.ts   # Config Vite
│   │   ├── tailwind.config.js
│   │   └── tsconfig.json
│   ├── mobile/
│   │   ├── app.config.js    # Config Expo
│   │   └── eas.json         # Config EAS Build
│   └── scan-lib/
│       ├── tsconfig.json
│       └── package.json
└── .github/
    └── workflows/           # CI/CD GitHub Actions
```

## Prochaines Étapes

1. [Déployer en production](DEPLOYMENT.md)
2. [Consulter la documentation API](API.md)
3. [Comprendre l'architecture](ARCHITECTURE.md)
4. [Contribuer au projet](CONTRIBUTING.md)
