# ScanFactory Modal OCR Service

Service de traitement OCR et d'extraction de données pour documents médicaux, déployé sur [Modal](https://modal.com).

## Fonctionnalités

- **OCR haute précision** avec PaddleOCR (support français)
- **Analyse de layout** pour documents structurés
- **Extraction IA** avec Claude pour données médicales
- **Pipelines spécialisés** : Bulletin de soins, Factures
- **Scalabilité automatique** avec Modal

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Modal Platform                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐               │
│  │   OCRService     │    │ ExtractionService │              │
│  │   (PaddleOCR)    │───▶│    (Claude AI)    │              │
│  │   CPU: 2, 4GB    │    │   CPU: 1, 1GB     │              │
│  └────────┬─────────┘    └────────┬─────────┘               │
│           │                       │                          │
│  ┌────────▼───────────────────────▼─────────┐               │
│  │            Web Endpoints                  │               │
│  │  /process_ocr  /process_extraction       │               │
│  │  /process_document  /health              │               │
│  └──────────────────────────────────────────┘               │
│                                                              │
│  ┌──────────────────┐                                       │
│  │  Model Cache     │  (Volume persistant)                  │
│  │  PaddleOCR models│                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

## Prérequis

- Python 3.10+
- Compte [Modal](https://modal.com)
- Clé API Anthropic (pour l'extraction)

## Installation

```bash
# Installer Modal CLI
pip install modal

# S'authentifier
modal token new

# Cloner et naviguer
cd packages/modal-ocr
```

## Configuration

### 1. Secret Anthropic

```bash
modal secret create anthropic-api-key ANTHROPIC_API_KEY=sk-ant-xxx
```

### 2. Volume pour le cache

```bash
modal volume create scanfactory-model-cache
```

## Déploiement

### Méthode simple

```bash
chmod +x deploy.sh
./deploy.sh
```

### Méthode manuelle

```bash
modal deploy app.py
```

## Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/process_ocr` | POST | Traitement OCR seul |
| `/process_extraction` | POST | Extraction de données |
| `/process_document` | POST | Pipeline complète OCR + Extraction |

### Documentation interactive

Chaque endpoint expose une documentation Swagger à `/docs`.

## Utilisation

### OCR seul

```bash
curl -X POST https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/document.jpg",
    "with_layout": true
  }'
```

**Réponse:**
```json
{
  "text": "Texte extrait du document...",
  "blocks": [
    {
      "text": "BULLETIN DE SOINS",
      "confidence": 0.98,
      "bbox": {"x1": 100, "y1": 50, "x2": 400, "y2": 80}
    }
  ],
  "confidence": 0.95,
  "layout_info": {
    "width": 800,
    "height": 1200,
    "regions": [
      {"type": "header", "y_start": 0, "y_end": 180}
    ]
  }
}
```

### Extraction seule

```bash
curl -X POST https://devfactory-ai--scanfactory-ocr-process-extraction.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "ocr_text": "BULLETIN DE SOINS\nPatient: DUPONT Jean\n...",
    "pipeline": "bulletin_soin"
  }'
```

**Réponse:**
```json
{
  "success": true,
  "data": {
    "patient_nom": {"value": "DUPONT", "confidence": 0.95},
    "patient_prenom": {"value": "Jean", "confidence": 0.92},
    "date_soins": {"value": "2024-02-15", "confidence": 0.88},
    "montant_total": {"value": 45.50, "confidence": 0.90}
  },
  "model": "claude-3-haiku"
}
```

### Pipeline complète

```bash
curl -X POST https://devfactory-ai--scanfactory-ocr-process-document.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "base64_encoded_image...",
    "pipeline": "bulletin_soin"
  }'
```

**Réponse:**
```json
{
  "ocr_result": {
    "text": "...",
    "blocks": [...],
    "confidence": 0.95
  },
  "extracted_data": {
    "success": true,
    "data": {...}
  },
  "pipeline": "bulletin_soin"
}
```

## Pipelines disponibles

### bulletin_soin

Extraction de bulletins de soins CPAM:
- `patient_nom`, `patient_prenom`, `patient_nir`
- `patient_date_naissance`
- `date_soins`
- `prescripteur_nom`, `prescripteur_finess`
- `actes` (liste)
- `montant_total`
- `organisme`

### facture

Extraction de factures médicales:
- `numero_facture`, `date_facture`
- `emetteur_nom`, `emetteur_siret`, `emetteur_adresse`
- `patient_nom`
- `lignes` (liste)
- `sous_total_ht`, `tva`, `total_ttc`
- `mode_paiement`

### generic

Pipeline générique avec champs personnalisés:

```json
{
  "pipeline": "generic",
  "fields": [
    {"name": "date", "type": "date", "description": "Date du document"},
    {"name": "montant", "type": "number", "description": "Montant total"}
  ]
}
```

## Intégration avec Cloudflare

L'API Cloudflare appelle les endpoints Modal pour le traitement:

```typescript
// packages/api/src/core/extraction/modal-client.ts
const MODAL_BASE_URL = 'https://devfactory-ai--scanfactory-ocr';

export async function processDocument(imageUrl: string, pipeline: string) {
  const response = await fetch(`${MODAL_BASE_URL}-process-document.modal.run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, pipeline })
  });
  return response.json();
}
```

## Développement local

```bash
# Lancer en mode développement (hot reload)
modal serve app.py

# Tester une fonction
modal run app.py::health
```

## Monitoring

Accéder au dashboard Modal pour voir:
- Logs en temps réel
- Métriques de performance
- Utilisation des ressources
- Historique des invocations

## Coûts estimés

| Resource | Coût approximatif |
|----------|-------------------|
| OCR (CPU 2 cores, 4GB) | ~$0.0002/sec |
| Extraction (CPU 1 core, 1GB) | ~$0.00008/sec |
| Volume storage | ~$0.20/GB/mois |

Pipeline complète moyenne: ~$0.001-0.002 par document

## Troubleshooting

### Erreur "Secret not found"

```bash
modal secret create anthropic-api-key ANTHROPIC_API_KEY=your-key
```

### Erreur "Volume not found"

```bash
modal volume create scanfactory-model-cache
```

### Timeout OCR

Augmenter le timeout dans `app.py`:
```python
@app.cls(..., timeout=600)  # 10 minutes
```

### Modèles PaddleOCR non téléchargés

Les modèles sont téléchargés automatiquement au premier appel. Le premier appel peut prendre 30-60 secondes.
