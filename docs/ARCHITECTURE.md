# Architecture ScanFactory

Documentation technique de l'architecture de ScanFactory.

## Vue d'Ensemble

ScanFactory est une application distribuée basée sur une architecture edge-first utilisant Cloudflare comme plateforme principale.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Utilisateurs                                │
├────────────────────┬────────────────────┬───────────────────────────────┤
│     Opérateurs     │    Validateurs     │        Administrateurs        │
│   (Mobile Scan)    │   (Web Validation) │       (Web Admin)             │
└─────────┬──────────┴─────────┬──────────┴──────────────┬────────────────┘
          │                    │                         │
          ▼                    ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Applications Clientes                            │
├─────────────────────┬───────────────────────────────────────────────────┤
│                     │                                                   │
│  ┌───────────────┐  │  ┌───────────────┐  ┌───────────────────────────┐│
│  │  Mobile App   │  │  │   Web App     │  │       scan-lib            ││
│  │  (Expo/RN)    │  │  │  (React/Vite) │  │  (Shared Scanning Logic)  ││
│  │               │  │  │               │  │                           ││
│  │ - Scanner     │  │  │ - Validation  │  │ - Edge Detection          ││
│  │ - Preview     │  │  │ - Dashboard   │  │ - Perspective Correction  ││
│  │ - Upload      │  │  │ - Export      │  │ - Quality Analysis        ││
│  └───────┬───────┘  │  └───────┬───────┘  │ - OCR Adapters            ││
│          │          │          │          └───────────────────────────┘│
└──────────┼──────────┴──────────┼────────────────────────────────────────┘
           │                     │
           │    HTTPS/REST API   │
           └──────────┬──────────┘
                      │
┌─────────────────────▼───────────────────────────────────────────────────┐
│                        Cloudflare Edge Network                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Cloudflare Workers (API)                      │   │
│  │                                                                  │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │   │
│  │  │   Auth   │ │Extraction│ │Validation│ │  Batch   │            │   │
│  │  │  Routes  │ │  Routes  │ │  Routes  │ │  Routes  │            │   │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │   │
│  │       │            │            │            │                   │   │
│  │  ┌────▼────────────▼────────────▼────────────▼─────┐            │   │
│  │  │              Middleware Layer                    │            │   │
│  │  │  CORS │ Auth │ CSRF │ Rate Limit │ Logging      │            │   │
│  │  └────────────────────────────────────────────────┘            │   │
│  └──────────────────────────┬──────────────────────────────────────┘   │
│                             │                                           │
│  ┌──────────────────────────▼──────────────────────────────────────┐   │
│  │                     Core Services                                │   │
│  │                                                                  │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │   │
│  │  │  Pipeline  │  │   Batch    │  │   Audit    │                 │   │
│  │  │   Engine   │  │  Service   │  │   Logger   │                 │   │
│  │  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                 │   │
│  │        │               │               │                         │   │
│  └────────┼───────────────┼───────────────┼─────────────────────────┘   │
│           │               │               │                             │
│  ┌────────▼───────────────▼───────────────▼─────────────────────────┐   │
│  │                    Data Layer                                     │   │
│  │                                                                   │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │  D1 (SQL)   │  │  R2 (Blob)  │  │  KV (Cache) │              │   │
│  │  │             │  │             │  │             │              │   │
│  │  │ - Users     │  │ - Scans     │  │ - Sessions  │              │   │
│  │  │ - Documents │  │ - Exports   │  │ - Rate Lim  │              │   │
│  │  │ - Batches   │  │             │  │ - OTP Cache │              │   │
│  │  │ - Pipelines │  │             │  │             │              │   │
│  │  │ - Audit Log │  │             │  │             │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐   │
│  │                    Async Processing                               │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐     ┌─────────────────────────────────┐     │   │
│  │  │     Queues      │────▶│      Queue Consumer Worker       │     │   │
│  │  │                 │     │                                  │     │   │
│  │  │ - doc-queue     │     │  - OCR Processing               │     │   │
│  │  │ - export-queue  │     │  - Field Extraction             │     │   │
│  │  │                 │     │  - Anomaly Detection            │     │   │
│  │  └─────────────────┘     └─────────────────────────────────┘     │   │
│  │                                                                   │   │
│  │  ┌─────────────────┐                                             │   │
│  │  │  Cron Triggers  │                                             │   │
│  │  │                 │                                             │   │
│  │  │ - Auto-close    │                                             │   │
│  │  │ - Cleanup       │                                             │   │
│  │  └─────────────────┘                                             │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                      │
                      │ External APIs
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Services Externes                                │
├─────────────────────┬───────────────────────────────────────────────────┤
│  ┌───────────────┐  │  ┌───────────────┐  ┌───────────────────────────┐│
│  │  Twilio SMS   │  │  │   OCR API     │  │   Systèmes Tiers          ││
│  │  (OTP)        │  │  │  (Claude/GPT) │  │   (Export CPAM, etc.)     ││
│  └───────────────┘  │  └───────────────┘  └───────────────────────────┘│
└─────────────────────┴───────────────────────────────────────────────────┘
```

## Composants Principaux

### 1. Applications Clientes

#### Mobile App (Expo/React Native)
- **Rôle** : Capture de documents
- **Technologies** : Expo, React Native, expo-camera
- **Fonctionnalités** :
  - Scan avec détection automatique des bords
  - Preview et correction
  - Upload vers l'API
  - Mode hors-ligne avec queue locale

#### Web App (React/Vite)
- **Rôle** : Validation et administration
- **Technologies** : React 18, Vite, TailwindCSS, TanStack Query
- **Fonctionnalités** :
  - Interface de validation split-view
  - Gestion des lots
  - Dashboard et statistiques
  - Export des données

#### scan-lib (TypeScript)
- **Rôle** : Logique de scan partagée
- **Utilisé par** : Mobile, Web (si besoin)
- **Fonctionnalités** :
  - Détection d'edges (Sobel)
  - Correction de perspective (DLT)
  - Analyse de qualité (Laplacian)
  - Adaptateurs OCR (Tesseract, ML Kit)

### 2. API Backend (Cloudflare Workers)

#### Framework et Structure
- **Framework** : Hono (léger, compatible edge)
- **Runtime** : Cloudflare Workers (V8 isolates)
- **Structure** :
  ```
  src/
  ├── index.ts          # Point d'entrée, routing
  ├── auth/             # Authentification OTP
  ├── core/
  │   ├── extraction/   # Upload et OCR
  │   ├── validation/   # Validation des documents
  │   ├── batches/      # Gestion des lots
  │   └── pipeline/     # Moteur de pipeline
  ├── middleware/       # CORS, Auth, Logging, Rate Limit
  ├── lib/              # Utilitaires partagés
  └── db/               # Schéma et migrations
  ```

#### Middleware Stack
```
Request
    │
    ▼
┌─────────────────┐
│  Request Logger │  → Log structuré JSON + X-Request-ID
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│      CORS       │  → Vérification origine
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│  Rate Limiter   │  → Limite par IP/user
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│      Auth       │  → Validation JWT
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│      CSRF       │  → Double-submit cookie
└────────┬────────┘
         │
    ▼
┌─────────────────┐
│    Handler      │  → Logique métier
└────────┬────────┘
         │
    ▼
Response
```

### 3. Stockage de Données

#### D1 (SQLite distribué)
- **Usage** : Données relationnelles
- **Tables** : users, pipelines, documents, batches, audit_log
- **Caractéristiques** :
  - SQL complet
  - Réplication automatique
  - Transactions via `db.batch()`

#### R2 (Object Storage)
- **Usage** : Fichiers binaires
- **Buckets** :
  - `scanfactory-scans` : Images originales et traitées
  - `scanfactory-exports` : Fichiers d'export (CSV, PDF)
- **Caractéristiques** :
  - Compatible S3
  - Pas de frais d'egress

#### KV (Key-Value)
- **Usage** : Cache et données éphémères
- **Données** :
  - Sessions utilisateur
  - Rate limiting
  - Cache OTP
- **Caractéristiques** :
  - Eventually consistent
  - TTL supporté

### 4. Traitement Asynchrone

#### Queues
- **Usage** : Traitement OCR en background
- **Flow** :
  1. Document uploadé → Message dans queue
  2. Consumer traite le message
  3. Résultat stocké en D1
- **Retry** : 3 tentatives avec backoff

#### Cron Triggers
- **`*/5 * * * *`** : Traitement des documents en attente
- **`0 2 * * *`** : Fermeture auto des lots dépassés

## Flux de Données

### Flux de Scan (Mobile → API)

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Camera  │─────▶│  Edge    │─────▶│ Quality  │─────▶│ Capture  │
│  Frame   │      │ Detector │      │ Analyzer │      │          │
└──────────┘      └──────────┘      └──────────┘      └────┬─────┘
                                                          │
                                                          ▼
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Upload  │◀─────│ Optimize │◀─────│Perspectiv│◀─────│  Image   │
│  to API  │      │  Image   │      │ Correct  │      │          │
└────┬─────┘      └──────────┘      └──────────┘      └──────────┘
     │
     ▼
┌──────────────────────────────────────────────────────────────────┐
│                          API (Workers)                           │
├──────────────────────────────────────────────────────────────────┤
│  ┌──────────┐      ┌──────────┐      ┌──────────┐              │
│  │  Store   │─────▶│  Queue   │─────▶│  OCR     │              │
│  │  in R2   │      │  Message │      │ Consumer │              │
│  └──────────┘      └──────────┘      └────┬─────┘              │
│                                           │                     │
│  ┌──────────┐      ┌──────────┐      ┌────▼─────┐              │
│  │  Update  │◀─────│ Extract  │◀─────│  OCR     │              │
│  │    D1    │      │  Fields  │      │  Result  │              │
│  └──────────┘      └──────────┘      └──────────┘              │
└──────────────────────────────────────────────────────────────────┘
```

### Flux de Validation (Web)

```
┌──────────────────────────────────────────────────────────────────┐
│                       Web App (React)                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    ValidationDetail                          ││
│  │  ┌──────────────────┐    ┌──────────────────────────────┐   ││
│  │  │   ScanViewer     │    │      DocumentForm            │   ││
│  │  │                  │    │                              │   ││
│  │  │  - Zoom/Pan      │    │  - Champs extraits           │   ││
│  │  │  - Rotation      │    │  - Édition inline            │   ││
│  │  │                  │    │  - Validation/Rejet          │   ││
│  │  └──────────────────┘    └──────────────────────────────┘   ││
│  └─────────────────────────────────────────────────────────────┘│
│                               │                                  │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    TanStack Query                            ││
│  │                                                              ││
│  │  - Optimistic Updates      - Prefetch adjacent docs         ││
│  │  - Cache Management        - Background refetch             ││
│  └─────────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                          API (Workers)                           │
│                                                                  │
│  PUT /api/documents/:id                                          │
│    │                                                             │
│    ├─▶ Valider les données                                       │
│    ├─▶ Mettre à jour D1 (extracted_data, status)                │
│    ├─▶ Logger dans audit_log                                    │
│    └─▶ Retourner le document mis à jour                         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Sécurité

### Authentification

```
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  User    │─────▶│  Enter   │─────▶│  Send    │─────▶│  Store   │
│  Phone   │      │  Phone   │      │  OTP SMS │      │  OTP KV  │
└──────────┘      └──────────┘      └──────────┘      └────┬─────┘
                                                          │
                                                          ▼
┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
│  Access  │◀─────│  Set     │◀─────│  Create  │◀─────│  Verify  │
│   App    │      │  Cookie  │      │   JWT    │      │   OTP    │
└──────────┘      └──────────┘      └──────────┘      └──────────┘
```

- **OTP** : Généré cryptographiquement (crypto.randomInt)
- **JWT** : Signé avec HS256, expire en 24h
- **Cookie** : httpOnly, Secure, SameSite=Strict

### Protection CSRF

```
1. Client demande token CSRF (GET /api/csrf-token)
2. Serveur génère token + stocke hash en cookie
3. Client envoie token dans header X-CSRF-Token
4. Serveur valide token contre cookie
```

### Rate Limiting

| Endpoint | Limite | Fenêtre |
|----------|--------|---------|
| OTP Request | 5 | 1 minute |
| OTP Verify | 10 | 1 minute |
| Auth endpoints | 20 | 1 minute |
| API general | 100 | 1 minute |

## Pipelines OCR

### Architecture du Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                         Pipeline Engine                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐ │
│  │   OCR    │───▶│  Field   │───▶│  Rules   │───▶│ Computed │ │
│  │ Extract  │    │  Parser  │    │  Engine  │    │  Fields  │ │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘ │
│                                                                 │
│  Pipeline Config (JSON):                                        │
│  {                                                              │
│    "fields": [...],                                             │
│    "rules": {                                                   │
│      "extraction": [...],                                       │
│      "validation": [...],                                       │
│      "computation": [...]                                       │
│    }                                                            │
│  }                                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Modes d'Extraction

1. **Direct** : Extraction directe de l'OCR
2. **Replace** : Remplacement de valeurs (normalisation)
3. **Table** : Extraction de tableaux

### Règles de Validation

```json
{
  "validation_rules": [
    {
      "field": "date_soins",
      "rules": ["required", "date", "not_future"]
    },
    {
      "field": "montant_total",
      "rules": ["required", "positive_number", "max:10000"]
    },
    {
      "field": "patient_nir",
      "rules": ["required", "nir_format"]
    }
  ]
}
```

## Scalabilité

### Points de Scale

| Composant | Stratégie | Limite |
|-----------|-----------|--------|
| Workers | Auto-scale par Cloudflare | Illimité |
| D1 | Réplication automatique | 10GB/base |
| R2 | Distribué globalement | Illimité |
| KV | Edge caching | 25MB/valeur |
| Queues | Partitionnement auto | 1000 msg/s |

### Optimisations

- **Caching** : React Query côté client, KV côté serveur
- **Lazy Loading** : Code splitting par route
- **Optimistic Updates** : UI réactive
- **Prefetch** : Documents adjacents préchargés
- **Compression** : gzip sur toutes les réponses

## Monitoring

### Logs Structurés

```json
{
  "timestamp": "2024-02-17T12:00:00Z",
  "level": "info",
  "request_id": "req_abc123",
  "method": "POST",
  "path": "/api/documents",
  "status": 201,
  "duration_ms": 145,
  "user_id": "usr_xyz"
}
```

### Métriques

- **Cloudflare Analytics** : Requêtes, erreurs, latence
- **D1 Metrics** : Rows read/written, query time
- **Queue Metrics** : Messages processed, failures

### Alertes (recommandées)

- Error rate > 1%
- P95 latency > 500ms
- Queue backlog > 1000
- D1 storage > 80%
