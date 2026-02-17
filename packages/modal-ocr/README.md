# ScanFactory Modal OCR Service

Service de traitement OCR pour documents médicaux avec PaddleOCR, déployé sur [Modal](https://modal.com).

> **Note**: L'extraction LLM est gérée par Cloudflare Workers AI (gratuit) avec des modèles open-source comme Llama 3.1 et Mistral.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Pipeline Complète                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌──────────────────┐     ┌─────────────────────────────┐  │
│  │  Image  │────▶│  Modal           │────▶│  Cloudflare Workers AI      │  │
│  │  (scan) │     │  (PaddleOCR)     │     │  (Llama 3.1 / Mistral)      │  │
│  └─────────┘     │                  │     │                             │  │
│                  │  - OCR français  │     │  - Extraction structurée    │  │
│                  │  - Layout detect │     │  - bulletin_soin, facture   │  │
│                  │  - ~$0.001/doc   │     │  - GRATUIT                  │  │
│                  └──────────────────┘     └─────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Fonctionnalités

- **OCR haute précision** avec PaddleOCR (support français natif)
- **Détection de layout** pour documents structurés (header, body, footer)
- **Scalabilité automatique** avec Modal
- **Cache des modèles** pour démarrages rapides

## Prérequis

- Python 3.10+
- Compte [Modal](https://modal.com) (gratuit pour démarrer)

## Installation

```bash
# Installer Modal CLI
pip install modal

# S'authentifier
modal token new

# Naviguer vers le package
cd packages/modal-ocr
```

## Déploiement

### Méthode simple

```bash
chmod +x deploy.sh
./deploy.sh
```

### Méthode manuelle

```bash
# Créer le volume pour le cache
modal volume create scanfactory-model-cache

# Déployer
modal deploy app.py
```

## Endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/process_ocr` | POST | Traitement OCR |

### URL de base

```
https://devfactory-ai--scanfactory-ocr-{endpoint}.modal.run
```

## Utilisation

### OCR simple

```bash
curl -X POST https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/document.jpg",
    "with_layout": true
  }'
```

### Réponse

```json
{
  "success": true,
  "text": "BULLETIN DE SOINS\nPatient: DUPONT Jean\n...",
  "blocks": [
    {
      "text": "BULLETIN DE SOINS",
      "confidence": 0.98,
      "bbox": {"x1": 100, "y1": 50, "x2": 400, "y2": 80}
    }
  ],
  "layout_info": {
    "width": 800,
    "height": 1200,
    "regions": [
      {"type": "header", "y_start": 0, "y_end": 180, "block_count": 3},
      {"type": "body", "y_start": 180, "y_end": 1020, "block_count": 25},
      {"type": "footer", "y_start": 1020, "y_end": 1200, "block_count": 2}
    ]
  },
  "confidence": 0.95
}
```

### Avec image base64

```bash
curl -X POST https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "'$(base64 -i document.jpg)'"
  }'
```

## Intégration avec Cloudflare

Le flux complet utilise Modal pour l'OCR et Cloudflare Workers AI pour l'extraction:

```typescript
// 1. OCR avec Modal
const ocrResult = await modalAdapter.ocr(imageUrl);

// 2. Extraction avec Workers AI (gratuit)
const extractor = new WorkersAIExtractor(env);
const extracted = await extractor.extractBulletinSoin(ocrResult.text);
```

Configuration `wrangler.toml`:
```toml
[vars]
MODAL_OCR_URL = "https://devfactory-ai--scanfactory-ocr"

[ai]
binding = "AI"
```

## Développement local

```bash
# Mode développement (hot reload)
modal serve app.py

# Tester une fonction
modal run app.py::health
```

## Coûts

| Service | Coût |
|---------|------|
| Modal OCR | ~$0.0002/sec (~$0.001/doc) |
| Workers AI | **GRATUIT** |
| **Total** | **~$0.001/document** |

## Monitoring

- **Dashboard Modal**: https://modal.com/apps/scanfactory-ocr
- **Logs**: Accessibles dans le dashboard
- **Métriques**: CPU, mémoire, latence

## Troubleshooting

### Erreur "Volume not found"

```bash
modal volume create scanfactory-model-cache
```

### Premier appel lent

Les modèles PaddleOCR sont téléchargés au premier appel (~30-60 sec).
Les appels suivants sont rapides grâce au cache.

### Timeout

Augmenter le timeout dans `app.py`:
```python
@app.cls(..., timeout=600)  # 10 minutes
```
