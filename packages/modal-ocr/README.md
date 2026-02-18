# ScanFactory Multi-OCR Service

Service de traitement OCR multi-moteurs pour documents médicaux, déployé sur [Modal](https://modal.com).

## Moteurs OCR disponibles

| Moteur | Description | GPU | Langues |
|--------|-------------|-----|---------|
| **PaddleOCR** | OCR haute précision | Non | 90+ |
| **SuryaOCR** | Document understanding avec Docling | Oui | 90+ |
| **HunyuanOCR** | VLM 1B paramètres (state-of-the-art) | Oui | 90+ |
| **EasyOCR** | OCR simple et rapide | Non | 80+ |
| **Tesseract** | OCR classique | Non | 100+ |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ScanFactory Multi-OCR                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌───────────────────────────────────────────────────────┐ │
│  │  Image  │────▶│                OCR Engine Factory                     │ │
│  │  (scan) │     └───────────────────────┬───────────────────────────────┘ │
│  └─────────┘                             │                                  │
│                      ┌───────────────────┼───────────────────┐             │
│                      │                   │                   │             │
│                      ▼                   ▼                   ▼             │
│               ┌──────────┐        ┌──────────┐        ┌──────────┐        │
│               │PaddleOCR │        │ SuryaOCR │        │ EasyOCR  │        │
│               │  (CPU)   │        │  (GPU)   │        │  (CPU)   │        │
│               └──────────┘        └──────────┘        └──────────┘        │
│                      │                   │                   │             │
│                      └───────────────────┼───────────────────┘             │
│                                          │                                  │
│                                          ▼                                  │
│                              ┌──────────────────────┐                      │
│                              │  Cloudflare Workers  │                      │
│                              │    AI (Extraction)   │                      │
│                              │      (GRATUIT)       │                      │
│                              └──────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

### Prérequis

- Python 3.10+
- Compte [Modal](https://modal.com)

### Installation locale

```bash
cd packages/modal-ocr

# Créer un environnement virtuel
python -m venv venv
source venv/bin/activate

# Installer les dépendances de base
pip install -r requirements/base.txt

# Installer les moteurs OCR souhaités
pip install -r requirements/paddleocr.txt
pip install -r requirements/surya.txt
pip install -r requirements/easyocr.txt

# Support GPU (optionnel)
pip install -r requirements/gpu.txt
```

## Utilisation

### CLI locale

```bash
# Document unique avec SuryaOCR
python main.py --input ./docs/sample.pdf --engine surya --formats markdown json

# Batch processing avec PaddleOCR
python main.py --input ./docs/ --engine paddleocr --batch

# Utiliser le moteur par défaut (config)
python main.py --input ./docs/invoice.pdf

# Lister les moteurs disponibles
python main.py --list-engines

# Afficher les infos device (GPU/CPU)
python main.py --device-info
```

### Déploiement Modal

```bash
# Installer Modal CLI
pip install modal

# S'authentifier
modal token new

# Créer le volume pour le cache
modal volume create scanfactory-model-cache

# Déployer
modal deploy app.py
```

### API Modal

```bash
# OCR avec PaddleOCR (défaut)
curl -X POST https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/document.jpg"
  }'

# OCR avec SuryaOCR
curl -X POST https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/document.jpg",
    "engine": "surya"
  }'

# Lister les moteurs
curl https://devfactory-ai--scanfactory-ocr-list-engines.modal.run
```

### Docker

```bash
# Build
docker build -t scanfactory-ocr .

# Run avec GPU
docker run --gpus all \
  -v $(pwd)/input:/app/input \
  -v $(pwd)/output:/app/output \
  scanfactory-ocr --engine surya

# Run CPU only
docker-compose --profile cpu up scanfactory-ocr-cpu
```

## Configuration

### `config/ocr_config.yaml`

```yaml
ocr:
  default_engine: "surya"

  engines:
    paddleocr:
      enabled: true
      device: "auto"
      languages: ["fr", "en"]

    surya:
      enabled: true
      device: "auto"
      languages: ["en", "fr"]
      pipeline_options:
        do_ocr: true

    hunyuan:
      enabled: true
      device: "auto"
      languages: ["en", "fr", "zh"]
      tasks: ["detection", "parsing", "layout"]

  output:
    formats: ["markdown", "json"]
```

## Structure du projet

```
packages/modal-ocr/
├── app.py                  # Modal application
├── main.py                 # CLI entry point
├── config/
│   ├── ocr_config.yaml     # Configuration
│   └── settings.py         # Config loader
├── core/
│   ├── ocr_strategy.py     # Strategy interface
│   ├── ocr_factory.py      # Engine factory
│   └── document_processor.py
├── engines/
│   ├── base_engine.py      # Base class
│   ├── paddleocr_engine.py
│   ├── surya_engine.py
│   ├── hunyuan_engine.py
│   ├── tesseract_engine.py
│   └── easyocr_engine.py
├── utils/
│   ├── hardware_detector.py
│   ├── format_converter.py
│   └── logger.py
├── tests/
├── requirements/
│   ├── base.txt
│   ├── paddleocr.txt
│   ├── surya.txt
│   ├── hunyuan.txt
│   └── gpu.txt
├── Dockerfile
└── docker-compose.yml
```

## Comparaison des moteurs

| Critère | PaddleOCR | SuryaOCR | HunyuanOCR | Tesseract | EasyOCR |
|---------|-----------|----------|------------|-----------|---------|
| **Précision** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Vitesse CPU** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Vitesse GPU** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | N/A | ⭐⭐⭐⭐ |
| **Layout** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Tables** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Handwriting** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Taille modèle** | ~100MB | ~500MB | ~1GB | ~10MB | ~100MB |

## Recommandations

- **Documents PDF/Images structurés** → SuryaOCR
- **Production haute précision** → HunyuanOCR
- **Batch processing rapide** → PaddleOCR
- **Ressources limitées** → Tesseract
- **Setup rapide** → EasyOCR

## Coûts

| Service | Coût |
|---------|------|
| Modal (PaddleOCR) | ~$0.0002/sec |
| Modal (SuryaOCR GPU) | ~$0.001/sec |
| Workers AI (extraction) | **GRATUIT** |
| **Total par document** | **~$0.001-0.005** |

## Tests

```bash
# Tous les tests
python -m pytest tests/

# Tests avec couverture
python -m pytest tests/ --cov=.

# Tests d'un moteur spécifique
python -m pytest tests/test_surya.py
```
