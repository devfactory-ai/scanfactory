# ScanFactory - Guide de Déploiement

Ce guide explique comment déployer ScanFactory sur Cloudflare.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                    │
│  │ Cloudflare      │    │ Cloudflare      │                    │
│  │ Pages           │    │ Workers         │                    │
│  │ (Web React)     │───▶│ (API Hono)      │                    │
│  └─────────────────┘    └────────┬────────┘                    │
│                                  │                              │
│         ┌────────────────────────┼────────────────────────┐    │
│         │                        │                        │    │
│         ▼                        ▼                        ▼    │
│  ┌─────────────┐         ┌─────────────┐         ┌───────────┐│
│  │ D1 Database │         │ R2 Storage  │         │ KV Cache  ││
│  │ (SQLite)    │         │ (Scans/     │         │ (Sessions)││
│  │             │         │  Exports)   │         │           ││
│  └─────────────┘         └─────────────┘         └───────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Queues (Async Processing)            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Prérequis

1. **Compte Cloudflare** avec plan Workers Paid (pour Queues)
2. **wrangler CLI** installé : `npm install -g wrangler`
3. **Authentification** : `wrangler login`
4. **Domaine** configuré dans Cloudflare DNS

## Configuration Initiale

### 1. Créer l'infrastructure Cloudflare

```bash
# Staging
./scripts/setup-cloudflare.sh staging

# Production
./scripts/setup-cloudflare.sh production
```

Ce script crée automatiquement :
- Base de données D1
- Namespace KV
- Buckets R2 (scans + exports)
- Queues

### 2. Mettre à jour wrangler.toml

Après exécution du script, mettez à jour `packages/api/wrangler.toml` avec les IDs générés :

```toml
# Staging
[[env.staging.d1_databases]]
database_id = "votre-staging-db-id"

[[env.staging.kv_namespaces]]
id = "votre-staging-kv-id"

# Production
[[env.production.d1_databases]]
database_id = "votre-production-db-id"

[[env.production.kv_namespaces]]
id = "votre-production-kv-id"
```

### 3. Configurer les secrets

```bash
# JWT Secret (générer une clé sécurisée de 32+ caractères)
npx wrangler secret put JWT_SECRET --env staging
npx wrangler secret put JWT_SECRET --env production

# OCR API Key
npx wrangler secret put OCR_API_KEY --env staging
npx wrangler secret put OCR_API_KEY --env production

# Twilio (pour OTP SMS)
npx wrangler secret put TWILIO_ACCOUNT_SID --env production
npx wrangler secret put TWILIO_AUTH_TOKEN --env production
npx wrangler secret put TWILIO_PHONE_NUMBER --env production
```

### 4. Configurer le domaine

Dans le dashboard Cloudflare :
1. Aller dans **Workers & Pages** > **scanfactory-api** > **Settings** > **Triggers**
2. Ajouter un Custom Domain : `api.scanfactory.devfactory.tn`

Pour Pages :
1. Aller dans **Workers & Pages** > **scanfactory-web** > **Custom domains**
2. Ajouter : `scanfactory.devfactory.tn`

## Déploiement

### Déploiement Manuel

```bash
# Staging - tout déployer
./scripts/deploy.sh staging all

# Production - API uniquement
./scripts/deploy.sh production api

# Production - Web uniquement
./scripts/deploy.sh production web
```

### Déploiement Automatique (CI/CD)

Le déploiement automatique est configuré via GitHub Actions :

| Branche | Environnement | Trigger |
|---------|---------------|---------|
| `staging` | Staging | Push automatique |
| `main` | Production | Push automatique |

#### Configurer les secrets GitHub

Dans **Settings** > **Secrets and variables** > **Actions** :

```
CLOUDFLARE_API_TOKEN     # Token avec permissions Workers + Pages + D1 + R2
CLOUDFLARE_ACCOUNT_ID    # ID de votre compte Cloudflare
```

Pour créer un API Token :
1. Cloudflare Dashboard > **My Profile** > **API Tokens**
2. **Create Token** > **Edit Cloudflare Workers** (template)
3. Ajouter les permissions :
   - Account: D1 Edit
   - Account: Workers R2 Storage Edit
   - Account: Workers KV Storage Edit
   - Zone: Workers Routes Edit

## Environnements

| Environnement | API URL | Web URL |
|---------------|---------|---------|
| Development | http://localhost:8787 | http://localhost:5173 |
| Staging | https://api-staging.scanfactory.devfactory.tn | https://staging.scanfactory.devfactory.tn |
| Production | https://api.scanfactory.devfactory.tn | https://scanfactory.devfactory.tn |

## Variables d'Environnement

### API (wrangler.toml)

| Variable | Description | Exemple |
|----------|-------------|---------|
| `ENVIRONMENT` | Environnement actuel | `production` |
| `CORS_ORIGIN` | Origine autorisée CORS | `https://scanfactory.devfactory.tn` |
| `OCR_API_URL` | URL de l'API OCR | `https://ocr.devfactory.tn/api` |
| `LOG_LEVEL` | Niveau de log | `warn` |

### Web (.env)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | URL de l'API |
| `VITE_ENVIRONMENT` | Environnement |

## Monitoring

### Logs

```bash
# Logs temps réel staging
npx wrangler tail --env staging

# Logs temps réel production
npx wrangler tail --env production
```

### Métriques

Dashboard Cloudflare > **Workers & Pages** > **scanfactory-api** > **Metrics**

- Requests per second
- CPU time
- Duration
- Errors

### Health Check

```bash
curl https://api.scanfactory.devfactory.tn/health
```

## Rollback

### Rollback API

```bash
# Lister les versions
npx wrangler deployments list --env production

# Rollback vers une version
npx wrangler rollback --env production
```

### Rollback Web

Dans Cloudflare Dashboard :
1. **Workers & Pages** > **scanfactory-web**
2. **Deployments** > Sélectionner un déploiement précédent
3. **Rollback to this deployment**

## Troubleshooting

### "Database not found"

```bash
# Vérifier que la DB existe
npx wrangler d1 list

# Réinitialiser le schéma si nécessaire
npx wrangler d1 execute scanfactory-db --file=packages/api/src/db/schema.sql --remote
```

### "KV namespace not found"

```bash
# Lister les namespaces
npx wrangler kv:namespace list

# Vérifier l'ID dans wrangler.toml
```

### Erreurs CORS

Vérifier que `CORS_ORIGIN` dans wrangler.toml correspond exactement à l'URL du frontend (sans trailing slash).

### Limites Cloudflare

| Ressource | Limite Free | Limite Paid |
|-----------|-------------|-------------|
| Workers requests/day | 100,000 | Illimité |
| D1 rows read/day | 5M | 50B |
| D1 rows written/day | 100K | 50M |
| R2 storage | 10 GB | Illimité |
| KV reads/day | 100K | 10M |
