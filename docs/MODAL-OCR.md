# ScanFactory Modal OCR Service

Guide complet d'utilisation, installation et configuration du service OCR multi-moteurs.

## Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Configuration](#configuration)
5. [Utilisation](#utilisation)
6. [Déploiement](#déploiement)
7. [API Reference](#api-reference)
8. [Moteurs OCR](#moteurs-ocr)
9. [Troubleshooting](#troubleshooting)

---

## Vue d'ensemble

Le service Modal-OCR est une solution multi-moteurs pour l'extraction de texte à partir de documents médicaux. Il supporte plusieurs moteurs OCR avec basculement automatique et configuration flexible.

### Caractéristiques principales

- **5 moteurs OCR** : PaddleOCR, SuryaOCR, HunyuanOCR, Tesseract, EasyOCR
- **Architecture Strategy Pattern** : Extensible et maintenable
- **Déploiement serverless** : Modal (GPU/CPU) ou Docker
- **Extraction IA gratuite** : Cloudflare Workers AI (Llama 3.1, Mistral)
- **Configuration YAML** : Simple et flexible

### Coûts estimés

| Service | Coût |
|---------|------|
| Modal (PaddleOCR CPU) | ~$0.0002/sec |
| Modal (SuryaOCR GPU) | ~$0.001/sec |
| Modal (HunyuanOCR GPU) | ~$0.001/sec |
| Workers AI (extraction) | **GRATUIT** |
| **Total par document** | **~$0.001-0.005** |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ScanFactory Multi-OCR                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐     ┌───────────────────────────────────────────────────────┐  │
│  │  Image  │────▶│                OCR Engine Factory                     │  │
│  │  (scan) │     └───────────────────────┬───────────────────────────────┘  │
│  └─────────┘                             │                                   │
│                      ┌───────────────────┼───────────────────┐              │
│                      │                   │                   │              │
│                      ▼                   ▼                   ▼              │
│               ┌──────────┐        ┌──────────┐        ┌──────────┐         │
│               │PaddleOCR │        │ SuryaOCR │        │ HunyuanOCR│        │
│               │  (CPU)   │        │  (GPU)   │        │   (GPU)   │        │
│               └──────────┘        └──────────┘        └──────────┘         │
│                      │                   │                   │              │
│                      └───────────────────┼───────────────────┘              │
│                                          │                                   │
│                                          ▼                                   │
│                              ┌──────────────────────┐                       │
│                              │  Cloudflare Workers  │                       │
│                              │    AI (Extraction)   │                       │
│                              │      (GRATUIT)       │                       │
│                              └──────────────────────┘                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Pattern Strategy

```
OCRStrategy (Interface)
    ├── PaddleOCREngine
    ├── SuryaEngine
    ├── HunyuanEngine
    ├── TesseractEngine
    └── EasyOCREngine
```

### Flux de traitement

1. **Réception** : Image via URL ou base64
2. **Sélection** : Factory sélectionne le moteur configuré
3. **OCR** : Extraction du texte avec le moteur choisi
4. **Extraction** : Cloudflare Workers AI extrait les champs structurés
5. **Retour** : JSON avec texte, confiance, et données extraites

---

## Installation

### Prérequis

| Logiciel | Version | Vérification |
|----------|---------|--------------|
| Python | 3.10+ | `python --version` |
| pip | 23+ | `pip --version` |
| Modal CLI | Latest | `modal --version` |

### Installation locale

```bash
cd packages/modal-ocr

# Créer un environnement virtuel
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou: venv\Scripts\activate  # Windows

# Installer les dépendances de base
pip install -r requirements/base.txt

# Installer les moteurs OCR souhaités
pip install -r requirements/paddleocr.txt   # PaddleOCR (recommandé)
pip install -r requirements/surya.txt       # SuryaOCR + Docling
pip install -r requirements/easyocr.txt     # EasyOCR
pip install -r requirements/tesseract.txt   # Tesseract

# Support GPU (optionnel)
pip install -r requirements/gpu.txt

# Tout installer
pip install -r requirements/all.txt
```

### Installation HunyuanOCR

HunyuanOCR nécessite une installation depuis GitHub :

```bash
# Installer depuis le repo officiel
pip install git+https://github.com/Tencent/HunyuanVideo.git#subdirectory=hymba_ocr

# Ou télécharger manuellement
git clone https://github.com/Tencent/HunyuanVideo.git
cd HunyuanVideo/hymba_ocr
pip install -e .
```

### Vérifier l'installation

```bash
# Lister les moteurs disponibles
python main.py --list-engines

# Afficher les infos hardware
python main.py --device-info
```

---

## Configuration

### Fichier de configuration

Créer/éditer `config/ocr_config.yaml` :

```yaml
ocr:
  # Moteur par défaut
  default_engine: "surya"

  # Configuration des moteurs
  engines:
    paddleocr:
      enabled: true
      device: "auto"           # auto, cpu, cuda, mps
      languages: ["fr", "en"]
      det_db_thresh: 0.3
      det_db_box_thresh: 0.5
      det_db_unclip_ratio: 1.6
      use_angle_cls: true

    surya:
      enabled: true
      device: "auto"
      languages: ["en", "fr"]
      pipeline_options:
        do_ocr: true
        accelerator: "cuda"    # cuda, mps, cpu

    hunyuan:
      enabled: true
      device: "auto"
      languages: ["en", "fr", "ar", "zh"]
      tasks:
        - detection
        - parsing
        - layout
      model_path: null         # Utilise le modèle par défaut

    tesseract:
      enabled: true
      device: "cpu"
      languages: ["fra", "eng"]
      psm: 3                   # Page Segmentation Mode
      oem: 3                   # OCR Engine Mode

    easyocr:
      enabled: true
      device: "auto"
      languages: ["fr", "en"]
      paragraph: true

  # Configuration de sortie
  output:
    formats: ["markdown", "json"]
    include_confidence: true
    include_bboxes: true
```

### Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `OCR_DEFAULT_ENGINE` | Moteur par défaut | `surya` |
| `OCR_DEVICE` | Device forcé | `auto` |
| `OCR_CONFIG_PATH` | Chemin du fichier config | `config/ocr_config.yaml` |
| `LOG_LEVEL` | Niveau de log | `INFO` |

### Priorité de configuration

1. Arguments CLI (priorité maximale)
2. Variables d'environnement
3. Fichier YAML
4. Valeurs par défaut

---

## Utilisation

### CLI (Command Line Interface)

#### Document unique

```bash
# Avec SuryaOCR (défaut)
python main.py --input ./docs/sample.pdf

# Avec PaddleOCR
python main.py --input ./docs/sample.pdf --engine paddleocr

# Avec HunyuanOCR
python main.py --input ./docs/sample.pdf --engine hunyuan

# Formats de sortie multiples
python main.py --input ./docs/sample.pdf --formats markdown json
```

#### Traitement batch

```bash
# Traiter tous les fichiers d'un dossier
python main.py --input ./docs/ --batch

# Avec moteur spécifique
python main.py --input ./docs/ --batch --engine paddleocr

# Avec dossier de sortie personnalisé
python main.py --input ./docs/ --batch --output-dir ./results/
```

#### Options avancées

```bash
# Forcer le device
python main.py --input ./docs/sample.pdf --device cuda

# Verbose mode
python main.py --input ./docs/sample.pdf -v

# Quiet mode (erreurs uniquement)
python main.py --input ./docs/sample.pdf -q

# Afficher la version
python main.py --version
```

### API Python

```python
from core.document_processor import DocumentProcessor
from config.settings import Settings

# Charger la configuration
settings = Settings()

# Créer le processeur
processor = DocumentProcessor(settings)

# Traiter un document
result = processor.process("./docs/sample.pdf", engine="surya")
print(result.text)
print(f"Confidence: {result.confidence}")

# Traitement batch
results = processor.batch_process("./docs/", engine="paddleocr")
for doc_result in results:
    print(f"{doc_result.source}: {doc_result.confidence}")

# Exporter en markdown
processor.export_to_markdown(result, "./output/sample.md")

# Exporter en JSON
processor.export_to_json(result, "./output/sample.json")
```

### Utilisation directe des moteurs

```python
from engines.surya_engine import SuryaEngine
from engines.paddleocr_engine import PaddleOCREngine

# SuryaOCR
surya = SuryaEngine({"languages": ["en", "fr"], "device": "cuda"})
surya.initialize()
result = surya.process("./document.pdf")
print(result.text)

# PaddleOCR
paddle = PaddleOCREngine({"languages": ["fr", "en"], "device": "cpu"})
paddle.initialize()
result = paddle.process("./document.png")
print(result.blocks)  # Avec bounding boxes
```

---

## Déploiement

### Modal (Recommandé)

#### Configuration initiale

```bash
# Installer Modal CLI
pip install modal

# S'authentifier
modal token new

# Créer le volume pour le cache des modèles
modal volume create scanfactory-model-cache
```

#### Déployer

```bash
cd packages/modal-ocr

# Déploiement production
modal deploy app.py

# Mode développement (hot reload)
modal serve app.py
```

#### Endpoints Modal

| Endpoint | Méthode | URL |
|----------|---------|-----|
| Health | GET | `https://devfactory-ai--scanfactory-ocr-health.modal.run` |
| List Engines | GET | `https://devfactory-ai--scanfactory-ocr-list-engines.modal.run` |
| Process OCR | POST | `https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run` |

#### Exemple d'appel API

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

# OCR avec image base64
curl -X POST https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run \
  -H "Content-Type: application/json" \
  -d '{
    "image_base64": "iVBORw0KGgoAAAANSUhEUg...",
    "engine": "paddleocr"
  }'
```

### Docker

#### Build et Run

```bash
cd packages/modal-ocr

# Build avec tous les moteurs
docker build -t scanfactory-ocr .

# Run avec GPU
docker run --gpus all \
  -v $(pwd)/input:/app/input \
  -v $(pwd)/output:/app/output \
  scanfactory-ocr --engine surya --batch

# Run CPU only
docker run \
  -v $(pwd)/input:/app/input \
  -v $(pwd)/output:/app/output \
  scanfactory-ocr --engine paddleocr --batch
```

#### Docker Compose

```bash
# Avec GPU (profil par défaut)
docker-compose up scanfactory-ocr

# CPU uniquement
docker-compose --profile cpu up scanfactory-ocr-cpu
```

#### Build personnalisé

```bash
# Installer uniquement certains moteurs
docker build -t scanfactory-ocr \
  --build-arg INSTALL_PADDLEOCR=true \
  --build-arg INSTALL_SURYA=false \
  --build-arg INSTALL_EASYOCR=false \
  --build-arg INSTALL_GPU=false \
  .
```

---

## API Reference

### Endpoint: `/process_ocr`

**Méthode:** POST

**Body:**

```json
{
  "image_url": "string (optionnel)",
  "image_base64": "string (optionnel)",
  "engine": "paddleocr|surya|hunyuan|easyocr|tesseract",
  "with_layout": true
}
```

**Response:**

```json
{
  "success": true,
  "text": "Extracted text content...",
  "blocks": [
    {
      "text": "Line of text",
      "confidence": 0.95,
      "bbox": {"x1": 10, "y1": 20, "x2": 200, "y2": 40}
    }
  ],
  "confidence": 0.92,
  "engine": "paddleocr",
  "layout": {
    "width": 1200,
    "height": 1600
  }
}
```

### Endpoint: `/list_engines`

**Méthode:** GET

**Response:**

```json
{
  "engines": [
    {
      "id": "paddleocr",
      "name": "PaddleOCR",
      "description": "High-accuracy OCR with layout detection",
      "languages": ["fr", "en", "zh", "ar"],
      "gpu_required": false
    },
    {
      "id": "surya",
      "name": "SuryaOCR",
      "description": "Advanced document understanding with Docling",
      "languages": ["fr", "en"],
      "gpu_required": true
    }
  ],
  "default": "paddleocr"
}
```

### Endpoint: `/health`

**Méthode:** GET

**Response:**

```json
{
  "status": "healthy",
  "service": "scanfactory-ocr",
  "version": "2.0.0",
  "engines": ["paddleocr", "surya", "easyocr"]
}
```

---

## Moteurs OCR

### Comparaison

| Critère | PaddleOCR | SuryaOCR | HunyuanOCR | Tesseract | EasyOCR |
|---------|-----------|----------|------------|-----------|---------|
| **Précision** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Vitesse CPU** | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Vitesse GPU** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | N/A | ⭐⭐⭐⭐ |
| **Layout** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Tables** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Handwriting** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Taille modèle** | ~100MB | ~500MB | ~1GB | ~10MB | ~100MB |
| **GPU requis** | Non | Recommandé | Oui | Non | Non |

### Recommandations par cas d'usage

| Cas d'usage | Moteur recommandé | Raison |
|-------------|-------------------|--------|
| Documents PDF structurés | SuryaOCR | Meilleure compréhension de layout |
| Production haute précision | HunyuanOCR | State-of-the-art VLM |
| Batch processing rapide | PaddleOCR | Bon ratio vitesse/précision |
| Ressources limitées | Tesseract | Très léger |
| Setup rapide | EasyOCR | Installation simple |
| Documents manuscrits | HunyuanOCR | Meilleur sur handwriting |
| Documents multilingues | PaddleOCR ou HunyuanOCR | 90+ langues |

### PaddleOCR

**Points forts:**
- Excellente précision sur documents imprimés
- Détection de layout intégrée
- Support 80+ langues
- Fonctionne bien sur CPU

**Configuration optimale:**
```yaml
paddleocr:
  use_angle_cls: true
  det_db_thresh: 0.3
  det_db_box_thresh: 0.5
  det_db_unclip_ratio: 1.6
```

### SuryaOCR

**Points forts:**
- Intégration Docling pour document understanding
- Excellent sur PDFs complexes
- Export markdown natif
- Détection de tables avancée

**Configuration optimale:**
```yaml
surya:
  pipeline_options:
    do_ocr: true
    accelerator: "cuda"  # Fortement recommandé
```

### HunyuanOCR

**Points forts:**
- Modèle VLM 1B paramètres
- State-of-the-art en précision
- Excellent sur documents manuscrits
- Support 90+ langues

**Configuration optimale:**
```yaml
hunyuan:
  tasks:
    - detection
    - parsing
    - layout
  device: "cuda"  # Requis
```

---

## Troubleshooting

### Erreur "Engine not found"

```bash
# Vérifier les moteurs installés
python main.py --list-engines

# Installer le moteur manquant
pip install -r requirements/[engine].txt
```

### Erreur CUDA "out of memory"

```bash
# Utiliser un batch size plus petit
python main.py --input ./docs/ --batch --batch-size 1

# Ou utiliser CPU
python main.py --input ./docs/ --device cpu
```

### Modal "Volume not found"

```bash
# Créer le volume
modal volume create scanfactory-model-cache

# Vérifier
modal volume list
```

### PaddleOCR "DLL load failed"

Sur Windows, installer les redistribuables Visual C++ :
```
https://aka.ms/vs/17/release/vc_redist.x64.exe
```

### Tesseract "Language not found"

```bash
# Linux
sudo apt-get install tesseract-ocr-fra tesseract-ocr-eng

# macOS
brew install tesseract-lang
```

### Logs et débogage

```bash
# Mode verbose
python main.py --input ./doc.pdf -v

# Logs Modal
modal logs scanfactory-ocr

# Docker logs
docker logs scanfactory-ocr -f
```

---

## Support

- **Issues**: https://github.com/devfactory-ai/scanfactory/issues
- **Documentation**: https://docs.devfactory.tn/scanfactory
- **Email**: support@devfactory.tn
