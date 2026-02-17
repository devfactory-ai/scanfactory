# ScanFactory API Documentation

Documentation complète de l'API REST ScanFactory.

## Base URL

| Environnement | URL |
|---------------|-----|
| Development | `http://localhost:8787/api` |
| Staging | `https://scanfactory-api-staging.workers.dev/api` |
| Production | `https://scanfactory-api.moka-598.workers.dev/api` |

## Authentification

L'API utilise l'authentification JWT avec OTP par SMS.

### Flux d'authentification

```
1. POST /api/auth/otp/request   → Demander un OTP
2. POST /api/auth/otp/verify    → Vérifier l'OTP → Recevoir JWT
3. Utiliser le JWT dans les requêtes suivantes
```

### Headers requis

```http
Authorization: Bearer <jwt_token>
Content-Type: application/json
X-CSRF-Token: <csrf_token>  # Pour les requêtes mutantes (POST, PUT, DELETE)
```

### Obtenir un token CSRF

```http
GET /api/csrf-token
```

**Réponse:**
```json
{
  "token": "abc123..."
}
```

---

## Endpoints

### Santé

#### GET /api/health

Vérifier l'état de l'API et de ses dépendances.

**Réponse:**
```json
{
  "status": "healthy",
  "timestamp": "2024-02-17T12:00:00Z",
  "version": "1.0.0",
  "checks": {
    "database": { "status": "ok", "latency_ms": 22 },
    "cache": { "status": "ok", "latency_ms": 5 },
    "storage": { "status": "ok", "latency_ms": 150 }
  }
}
```

---

### Authentification

#### POST /api/auth/otp/request

Demander l'envoi d'un OTP par SMS.

**Corps:**
```json
{
  "phone": "+33612345678"
}
```

**Réponse (200):**
```json
{
  "success": true,
  "message": "OTP envoyé",
  "expires_in": 300
}
```

**Erreurs:**
- `429` - Trop de tentatives (rate limit: 5/minute)
- `400` - Numéro de téléphone invalide

#### POST /api/auth/otp/verify

Vérifier un OTP et obtenir un token JWT.

**Corps:**
```json
{
  "phone": "+33612345678",
  "otp": "123456"
}
```

**Réponse (200):**
```json
{
  "success": true,
  "user": {
    "id": "usr_abc123",
    "phone": "+33612345678",
    "role": "operator"
  },
  "token": "eyJhbGciOiJIUzI1NiIs..."  // Uniquement pour mobile
}
```

> **Note:** Pour les clients web, le token est stocké dans un cookie httpOnly.

**Erreurs:**
- `401` - OTP invalide ou expiré
- `429` - Trop de tentatives

#### POST /api/auth/logout

Se déconnecter (invalide le cookie).

**Réponse (200):**
```json
{
  "success": true
}
```

#### GET /api/auth/me

Obtenir les informations de l'utilisateur connecté.

**Réponse (200):**
```json
{
  "user": {
    "id": "usr_abc123",
    "phone": "+33612345678",
    "role": "operator",
    "created_at": "2024-01-15T10:00:00Z"
  }
}
```

---

### Documents

#### POST /api/documents/upload

Uploader un scan de document.

**Content-Type:** `multipart/form-data`

**Champs:**
| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| `file` | File | Oui | Image du document (JPEG, PNG) |
| `pipeline_id` | string | Oui | ID du pipeline de traitement |
| `metadata` | JSON | Non | Métadonnées additionnelles |

**Réponse (201):**
```json
{
  "document": {
    "id": "doc_xyz789",
    "pipeline_id": "pip_bulletin_soin",
    "status": "processing",
    "created_at": "2024-02-17T12:00:00Z"
  },
  "upload_url": "https://r2.cloudflare.com/..."
}
```

#### GET /api/documents/:id

Obtenir un document par son ID.

**Réponse (200):**
```json
{
  "document": {
    "id": "doc_xyz789",
    "pipeline_id": "pip_bulletin_soin",
    "pipeline_name": "bulletin_soin",
    "pipeline_display_name": "Bulletin de Soins",
    "batch_id": "bat_abc123",
    "status": "pending",
    "extracted_data": {
      "date_soins": "2024-02-15",
      "patient_nom": "Dupont",
      "patient_prenom": "Jean",
      "montant_total": 45.50
    },
    "computed_data": {
      "age_patient": 45
    },
    "confidence_score": 0.87,
    "anomalies": [
      {
        "type": "low_confidence",
        "field": "patient_nom",
        "message": "Confiance faible sur le nom",
        "severity": "warning"
      }
    ],
    "created_at": "2024-02-17T12:00:00Z",
    "updated_at": "2024-02-17T12:05:00Z"
  },
  "field_display": {
    "groups": [
      {
        "name": "patient",
        "label": "Informations Patient",
        "fields": ["patient_nom", "patient_prenom", "patient_nir"]
      },
      {
        "name": "soins",
        "label": "Détails des Soins",
        "fields": ["date_soins", "actes", "montant_total"]
      }
    ]
  },
  "scan_url": "https://r2.cloudflare.com/scans/doc_xyz789.jpg"
}
```

#### PUT /api/documents/:id

Mettre à jour un document (validation/rejet).

**Corps:**
```json
{
  "extracted_data": {
    "date_soins": "2024-02-15",
    "patient_nom": "Dupont",
    "montant_total": 46.00
  },
  "action": "validate"
}
```

**Actions possibles:**
- `validate` - Valider le document
- `reject` - Rejeter le document

**Réponse (200):**
```json
{
  "document": {
    "id": "doc_xyz789",
    "status": "validated",
    "updated_at": "2024-02-17T12:10:00Z"
  }
}
```

#### GET /api/documents/:id/adjacent

Obtenir les documents adjacents (pour navigation).

**Query params:**
- `pipeline_id` - Filtrer par pipeline

**Réponse (200):**
```json
{
  "previous": "doc_xyz788",
  "next": "doc_xyz790",
  "position": 5,
  "total": 23
}
```

---

### File d'attente de validation

#### GET /api/validation/queue

Obtenir la file d'attente de documents à valider.

**Query params:**
| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `pipeline_id` | string | - | Filtrer par pipeline |
| `status` | string | `pending` | Statut des documents |
| `sort` | string | `confidence_asc` | Tri (confidence_asc, confidence_desc, date_asc, date_desc) |
| `limit` | number | 20 | Nombre de résultats |
| `offset` | number | 0 | Pagination |

**Réponse (200):**
```json
{
  "documents": [
    {
      "id": "doc_xyz789",
      "pipeline_id": "pip_bulletin_soin",
      "pipeline_display_name": "Bulletin de Soins",
      "status": "pending",
      "confidence_score": 0.65,
      "preview_data": {
        "date_soins": "2024-02-15",
        "patient_nom": "Dupont"
      },
      "anomaly_count": 2,
      "created_at": "2024-02-17T12:00:00Z"
    }
  ],
  "total": 45,
  "limit": 20,
  "offset": 0
}
```

#### GET /api/validation/stats

Statistiques de la file de validation.

**Réponse (200):**
```json
{
  "stats": {
    "pending": 45,
    "validated_today": 120,
    "rejected_today": 5,
    "avg_confidence": 0.82,
    "by_pipeline": {
      "bulletin_soin": { "pending": 30, "avg_confidence": 0.85 },
      "facture": { "pending": 15, "avg_confidence": 0.78 }
    }
  }
}
```

#### POST /api/validation/batch

Valider plusieurs documents en lot.

**Corps:**
```json
{
  "document_ids": ["doc_1", "doc_2", "doc_3"],
  "action": "validate"
}
```

**Réponse (200):**
```json
{
  "success": true,
  "processed": 3,
  "results": [
    { "id": "doc_1", "status": "validated" },
    { "id": "doc_2", "status": "validated" },
    { "id": "doc_3", "status": "validated" }
  ]
}
```

---

### Lots (Batches)

#### GET /api/batches

Lister les lots.

**Query params:**
| Param | Type | Défaut | Description |
|-------|------|--------|-------------|
| `pipeline_id` | string | - | Filtrer par pipeline |
| `status` | string | - | Filtrer par statut |
| `limit` | number | 20 | Nombre de résultats |
| `offset` | number | 0 | Pagination |

**Réponse (200):**
```json
{
  "batches": [
    {
      "id": "bat_abc123",
      "pipeline_id": "pip_bulletin_soin",
      "group_key": "2024-02",
      "group_label": "Février 2024",
      "status": "open",
      "document_count": 45,
      "pending_count": 12,
      "validated_count": 30,
      "rejected_count": 3,
      "total_amount": 15420.50,
      "opened_at": "2024-02-01T00:00:00Z",
      "closed_at": null
    }
  ],
  "total": 5
}
```

#### GET /api/batches/:id

Obtenir un lot par son ID.

**Réponse (200):**
```json
{
  "batch": {
    "id": "bat_abc123",
    "pipeline_id": "pip_bulletin_soin",
    "status": "verified",
    "document_count": 45,
    "documents": [
      {
        "id": "doc_1",
        "status": "validated",
        "extracted_data": { ... }
      }
    ]
  }
}
```

#### POST /api/batches/:id/close

Fermer un lot.

**Réponse (200):**
```json
{
  "batch": {
    "id": "bat_abc123",
    "status": "closed",
    "closed_at": "2024-02-17T18:00:00Z"
  }
}
```

#### POST /api/batches/:id/verify

Vérifier un lot (prêt pour export).

**Réponse (200):**
```json
{
  "batch": {
    "id": "bat_abc123",
    "status": "verified"
  }
}
```

**Erreurs:**
- `400` - Documents en attente de validation

#### POST /api/batches/:id/export

Exporter un lot.

**Corps:**
```json
{
  "format": "csv"
}
```

**Formats supportés:** `csv`, `json`, `xlsx`, `pdf`

**Réponse (200):**
```json
{
  "export_url": "https://r2.cloudflare.com/exports/bat_abc123.csv",
  "expires_at": "2024-02-18T12:00:00Z"
}
```

#### POST /api/batches/:id/reopen

Réouvrir un lot fermé.

**Réponse (200):**
```json
{
  "batch": {
    "id": "bat_abc123",
    "status": "open"
  }
}
```

---

### Pipelines

#### GET /api/pipelines

Lister les pipelines disponibles.

**Réponse (200):**
```json
{
  "pipelines": [
    {
      "id": "pip_bulletin_soin",
      "name": "bulletin_soin",
      "display_name": "Bulletin de Soins",
      "description": "Traitement des bulletins de soins CPAM",
      "fields": [
        { "name": "date_soins", "type": "date", "required": true },
        { "name": "patient_nom", "type": "string", "required": true },
        { "name": "montant_total", "type": "number", "required": true }
      ],
      "batch_config": {
        "group_by": "month",
        "max_count": 100,
        "max_days": 30
      }
    }
  ]
}
```

---

### Administration

> Requiert le rôle `admin`.

#### GET /api/admin/audit-log

Consulter le journal d'audit.

**Query params:**
| Param | Type | Description |
|-------|------|-------------|
| `user_id` | string | Filtrer par utilisateur |
| `action` | string | Filtrer par action (create, update, delete, export) |
| `entity_type` | string | Filtrer par type (document, batch, user) |
| `from` | ISO date | Date de début |
| `to` | ISO date | Date de fin |
| `limit` | number | Nombre de résultats |
| `offset` | number | Pagination |

**Réponse (200):**
```json
{
  "entries": [
    {
      "id": "aud_xyz",
      "user_id": "usr_abc",
      "action": "update",
      "entity_type": "document",
      "entity_id": "doc_123",
      "old_value": { "status": "pending" },
      "new_value": { "status": "validated" },
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "created_at": "2024-02-17T12:00:00Z"
    }
  ],
  "total": 1250
}
```

---

## Codes d'erreur

| Code | Nom | Description |
|------|-----|-------------|
| `AUTH_REQUIRED` | Authentification requise | Token manquant ou invalide |
| `AUTH_EXPIRED` | Token expiré | Le JWT a expiré |
| `FORBIDDEN` | Accès interdit | Permissions insuffisantes |
| `NOT_FOUND` | Ressource introuvable | L'entité demandée n'existe pas |
| `VALIDATION_ERROR` | Erreur de validation | Données invalides |
| `RATE_LIMITED` | Trop de requêtes | Rate limit atteint |
| `CSRF_INVALID` | Token CSRF invalide | Token CSRF manquant ou invalide |
| `INTERNAL_ERROR` | Erreur interne | Erreur serveur inattendue |

### Format des erreurs

```json
{
  "error": {
    "id": "err_abc123",
    "code": "VALIDATION_ERROR",
    "message": "Le champ 'montant' doit être un nombre positif",
    "request_id": "req_xyz789",
    "details": {
      "field": "montant",
      "value": -10,
      "constraint": "positive"
    }
  }
}
```

---

## Rate Limiting

| Endpoint | Limite |
|----------|--------|
| `POST /api/auth/otp/request` | 5 par minute par IP |
| `POST /api/auth/otp/verify` | 10 par minute par IP |
| Autres endpoints authentifiés | 100 par minute par utilisateur |

Les headers de réponse incluent :
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1708185600
```

---

## Pagination

Tous les endpoints de liste supportent la pagination :

```http
GET /api/documents?limit=20&offset=40
```

La réponse inclut toujours :
```json
{
  "data": [...],
  "total": 150,
  "limit": 20,
  "offset": 40
}
```

---

## Webhooks (à venir)

Les webhooks permettront de recevoir des notifications en temps réel :

- `document.created` - Nouveau document uploadé
- `document.processed` - OCR terminé
- `document.validated` - Document validé
- `batch.closed` - Lot fermé
- `batch.exported` - Lot exporté
