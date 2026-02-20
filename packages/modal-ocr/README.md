# ScanFactory Multi-OCR Service

Service de traitement OCR multi-moteurs pour documents, déployé sur [Modal](https://modal.com) ou Docker.

## Moteurs OCR disponibles

| Moteur | Type | Description | GPU | Langues | Coût |
|--------|------|-------------|-----|---------|------|
| **GutenOCR 3B** | VLM | Qwen2.5-VL, rapide | Opt. | 100+ | Gratuit |
| **GutenOCR 7B** | VLM | Qwen2.5-VL, haute précision | Rec. | 100+ | Gratuit |
| **Mistral OCR** | API | API Mistral AI, données structurées | Non | 100+ | $2/1000 pages |
| **SuryaOCR** | VLM | Document understanding | Rec. | 90+ | Gratuit |
| **HunyuanOCR** | VLM | Tencent VLM 1B | Oui | 90+ | Gratuit |
| **PaddleOCR** | Trad. | OCR haute précision | Opt. | 90+ | Gratuit |
| **EasyOCR** | Trad. | OCR simple et rapide | Opt. | 80+ | Gratuit |
| **Tesseract** | Trad. | OCR classique | Non | 100+ | Gratuit |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ScanFactory Multi-OCR                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐     ┌───────────────────────────────────────────────────────┐ │
│  │  Image  │────▶│           OCR Engine Factory (auto-select)            │ │
│  │  (scan) │     └───────────────────────┬───────────────────────────────┘ │
│  └─────────┘                             │                                  │
│           ┌──────────────┬───────────────┼───────────────┬──────────────┐  │
│           │              │               │               │              │  │
│           ▼              ▼               ▼               ▼              ▼  │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────┐│
│    │ GutenOCR │   │ Mistral  │   │ SuryaOCR │   │PaddleOCR │   │Tesseract││
│    │  (VLM)   │   │  (API)   │   │  (VLM)   │   │ (Trad.)  │   │ (Trad.) ││
│    └──────────┘   └──────────┘   └──────────┘   └──────────┘   └─────────┘│
│           │              │               │               │              │  │
│           └──────────────┴───────────────┼───────────────┴──────────────┘  │
│                                          │                                  │
│                                          ▼                                  │
│                              ┌──────────────────────┐                      │
│                              │   OCRResult (JSON)   │                      │
│                              │   + Structured Data  │                      │
│                              └──────────────────────┘                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Installation

### Prérequis

- Python 3.10+ (3.11 recommandé)
- Compte [Modal](https://modal.com) (optionnel)
- Clé API Mistral (pour Mistral OCR)

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
pip install -r requirements/gutenocr.txt    # GutenOCR (VLM)
pip install -r requirements/mistral_ocr.txt # Mistral OCR (API)
pip install -r requirements/surya.txt       # SuryaOCR
pip install -r requirements/paddleocr.txt   # PaddleOCR

# Tous les moteurs
pip install -r requirements/all.txt

# Support GPU (optionnel mais recommandé pour VLM)
pip install -r requirements/gpu.txt
```

### Configuration

Copier et personnaliser le fichier d'environnement:

```bash
cp .env.example .env
# Éditer .env avec vos paramètres
```

Variables importantes:
```bash
# GutenOCR
GUTENOCR_MODEL=rootsautomation/GutenOCR-3B  # ou GutenOCR-7B
GUTENOCR_DEVICE=auto

# Mistral OCR (obligatoire pour utiliser Mistral)
MISTRAL_API_KEY=your_api_key_here
```

## Utilisation

### CLI locale

```bash
# Document unique avec GutenOCR
python main.py --input ./docs/sample.pdf --engine gutenocr --formats markdown json

# Document avec Mistral OCR
python main.py --input ./docs/invoice.pdf --engine mistral_ocr

# Batch processing
python main.py --input ./docs/ --engine gutenocr-3b --batch

# Sélection automatique du meilleur moteur
python main.py --input ./docs/sample.pdf --engine auto

# Lister les moteurs disponibles
python main.py --list-engines

# Comparer les moteurs sur un document
python main.py --input ./docs/test.pdf --compare
```

### API Python

```python
from pathlib import Path
from core.ocr_factory import OCREngineFactory, SelectionPriority

# Création manuelle d'un moteur
from engines.gutenocr_engine import GutenOCREngine

engine = GutenOCREngine({
    "model_size": "3b",        # "3b" ou "7b"
    "device": "auto",          # "auto", "cuda", "cpu", "mps"
    "output_format": "TEXT",   # "TEXT", "LINES", "WORDS", "PARAGRAPHS", "LATEX"
})
engine.initialize()
result = engine.process(Path("document.pdf"))

print(result.text)
print(f"Confidence: {result.confidence}")

# Mistral OCR
from engines.mistral_ocr_engine import MistralOCREngine

engine = MistralOCREngine({
    "api_key": "sk-...",  # ou via MISTRAL_API_KEY env var
    "extract_tables": True,
    "extract_structure": True,
})
result = engine.process(Path("invoice.pdf"))

# Extraction de données structurées
structured = engine.extract_structured_data(Path("form.pdf"))
print(structured["tables"])

# Sélection automatique via Factory
engine_name = OCREngineFactory.auto_select_engine(
    priority=SelectionPriority.ACCURACY,
    document_type="invoice",
)
engine = OCREngineFactory.create_engine(engine_name, {})
result = engine.process(Path("document.pdf"))

# Comparaison de moteurs
comparison = OCREngineFactory.compare_engines(
    "document.pdf",
    engines=["gutenocr-3b", "mistral_ocr", "surya"]
)
for name, data in comparison["results"].items():
    print(f"{name}: {data['confidence']:.2%} ({data['processing_time_ms']}ms)")
```

### Docker

```bash
# Build tous les services
docker-compose build

# GutenOCR avec GPU
docker-compose --profile gutenocr up -d

# GutenOCR CPU uniquement (3B)
docker-compose --profile gutenocr-cpu up -d

# Mistral OCR (nécessite MISTRAL_API_KEY dans .env)
docker-compose --profile mistral up -d

# Gateway avec tous les moteurs
docker-compose --profile gateway up -d

# Voir les logs
docker-compose logs -f scanfactory-gutenocr
```

### API REST (Standalone)

L'API REST standalone permet de consommer le service OCR depuis d'autres applications.

```bash
# Démarrer l'API
python api.py --host 0.0.0.0 --port 8000

# Ou via Docker
docker-compose --profile api up -d
```

**Endpoints disponibles:**

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/health` | GET | Health check |
| `/api/v1/ocr/engines` | GET | Liste des moteurs disponibles |
| `/api/v1/ocr/process` | POST | Traiter un document (multipart) |
| `/api/v1/ocr/process/json` | POST | Traiter un document (JSON/base64) |
| `/api/v1/ocr/compare` | POST | Comparer plusieurs moteurs |
| `/api/v1/ocr/cost-estimate` | GET | Estimer le coût (Mistral) |
| `/docs` | GET | Documentation OpenAPI (Swagger) |
| `/redoc` | GET | Documentation OpenAPI (ReDoc) |

**Exemples d'utilisation:**

```bash
# Health check
curl http://localhost:8000/health

# Liste des moteurs
curl http://localhost:8000/api/v1/ocr/engines

# Traitement avec upload de fichier
curl -X POST http://localhost:8000/api/v1/ocr/process \
  -H "X-API-Key: your_api_key" \
  -F "file=@document.pdf" \
  -F "engine=auto" \
  -F "output_format=text"

# Traitement avec image en base64
curl -X POST http://localhost:8000/api/v1/ocr/process/json \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your_api_key" \
  -d '{
    "image_base64": "iVBORw0KGgo...",
    "engine": "gutenocr-3b",
    "output_format": "text"
  }'

# Traitement avec URL
curl -X POST http://localhost:8000/api/v1/ocr/process/json \
  -H "Content-Type: application/json" \
  -d '{
    "image_url": "https://example.com/document.png",
    "engine": "mistral_ocr"
  }'

# Comparaison de moteurs
curl -X POST http://localhost:8000/api/v1/ocr/compare \
  -F "file=@document.pdf" \
  -F "engines=gutenocr-3b,mistral_ocr,paddleocr"
```

**Authentification:**

```bash
# Configurer la clé API (optionnel)
export OCR_API_KEY=your_secure_api_key

# Utiliser la clé dans les requêtes
curl -H "X-API-Key: your_secure_api_key" http://localhost:8000/api/v1/ocr/engines
```

**Réponse type:**

```json
{
  "success": true,
  "text": "Texte extrait du document...",
  "confidence": 0.95,
  "blocks": [
    {"text": "Ligne 1", "confidence": 0.98, "type": "line"},
    {"text": "Ligne 2", "confidence": 0.94, "type": "line"}
  ],
  "engine": "gutenocr-3b",
  "processing_time_ms": 1250,
  "metadata": {"source": "document.pdf", "model": "rootsautomation/GutenOCR-3B"}
}
```

## Configuration avancée

### `config/ocr_config.yaml`

```yaml
ocr:
  default_engine: "gutenocr"

  engines:
    gutenocr:
      enabled: true
      device: "auto"
      model_size: "3b"       # "3b" (8GB RAM) ou "7b" (16GB RAM)
      output_format: "TEXT"  # TEXT, TEXT2D, LINES, WORDS, PARAGRAPHS, LATEX
      max_new_tokens: 4096
      batch_size: 4
      memory_cleanup: true

    mistral_ocr:
      enabled: true
      model: "mistral-ocr-2512"
      timeout: 60
      retry_attempts: 3
      extract_tables: true
      extract_structure: true

    surya:
      enabled: true
      device: "auto"
      languages: ["en", "fr"]

    paddleocr:
      enabled: true
      device: "auto"
      languages: ["fr", "en"]

  output:
    formats: ["markdown", "json"]
```

## Structure du projet

```
packages/modal-ocr/
├── app.py                    # Modal application
├── main.py                   # CLI entry point
├── .env.example              # Variables d'environnement
├── config/
│   └── ocr_config.yaml       # Configuration des moteurs
├── core/
│   ├── ocr_strategy.py       # Interface abstraite OCRStrategy
│   ├── ocr_factory.py        # Factory + auto-selection
│   └── document_processor.py # Processeur de documents
├── engines/
│   ├── base_engine.py        # Classe de base
│   ├── gutenocr_engine.py    # ✨ GutenOCR (VLM)
│   ├── mistral_ocr_engine.py # ✨ Mistral OCR (API)
│   ├── surya_engine.py       # SuryaOCR
│   ├── hunyuan_engine.py     # HunyuanOCR
│   ├── paddleocr_engine.py   # PaddleOCR
│   ├── tesseract_engine.py   # Tesseract
│   └── easyocr_engine.py     # EasyOCR
├── docker/
│   ├── Dockerfile.gutenocr   # ✨ Docker GutenOCR
│   └── Dockerfile.mistral    # ✨ Docker Mistral OCR
├── tests/
│   ├── test_gutenocr.py      # ✨ Tests GutenOCR
│   ├── test_mistral_ocr.py   # ✨ Tests Mistral OCR
│   ├── test_surya.py
│   └── test_integration.py
├── requirements/
│   ├── base.txt
│   ├── gutenocr.txt          # ✨ Deps GutenOCR
│   ├── mistral_ocr.txt       # ✨ Deps Mistral OCR
│   ├── surya.txt
│   └── all.txt
├── Dockerfile
└── docker-compose.yml
```

## Comparaison des moteurs

| Critère | GutenOCR 3B | GutenOCR 7B | Mistral OCR | SuryaOCR | PaddleOCR | Tesseract |
|---------|-------------|-------------|-------------|----------|-----------|-----------|
| **Précision** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Vitesse CPU** | ⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Vitesse GPU** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | N/A | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | N/A |
| **Layout** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Tables** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Manuscrits** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **RAM requise** | 8GB | 16GB | N/A | 8GB | 4GB | 1GB |
| **Coût** | Gratuit | Gratuit | $2/1000p | Gratuit | Gratuit | Gratuit |

## Recommandations par cas d'usage

| Cas d'usage | Moteur recommandé | Raison |
|-------------|-------------------|--------|
| **Documents standard** | GutenOCR 3B | Bon équilibre précision/vitesse |
| **Documents complexes** | GutenOCR 7B | Meilleure précision VLM |
| **Factures/Formulaires** | Mistral OCR | Extraction structurée native |
| **Manuscrits** | GutenOCR 7B | Excellent sur écriture manuscrite |
| **Production haute précision** | Mistral OCR | API fiable, données structurées |
| **Batch rapide** | PaddleOCR | Optimisé pour le volume |
| **Ressources limitées** | Tesseract | Léger, pas de GPU |
| **Sans GPU** | GutenOCR 3B ou Mistral | 3B tourne sur CPU, Mistral est API |

## Coûts estimés

| Service | Coût |
|---------|------|
| GutenOCR (local) | Gratuit (électricité/GPU) |
| Mistral OCR (API) | ~$0.002/page ($2/1000) |
| Modal (PaddleOCR) | ~$0.0002/sec |
| Modal (SuryaOCR GPU) | ~$0.001/sec |
| **Total par document** | **$0.001-0.01** |

## Tests

```bash
# Tous les tests
python -m pytest tests/

# Tests avec couverture
python -m pytest tests/ --cov=.

# Tests GutenOCR
python -m pytest tests/test_gutenocr.py -v

# Tests Mistral OCR
python -m pytest tests/test_mistral_ocr.py -v

# Tests d'intégration
python -m pytest tests/test_integration.py -v
```

## Troubleshooting

### GutenOCR: Out of Memory
```bash
# Forcer le modèle 3B et CPU
export GUTENOCR_MODEL=rootsautomation/GutenOCR-3B
export GUTENOCR_DEVICE=cpu
```

### Mistral OCR: API Key Invalid
```bash
# Vérifier la clé
echo $MISTRAL_API_KEY

# Tester l'API
curl -H "Authorization: Bearer $MISTRAL_API_KEY" \
  https://api.mistral.ai/v1/models
```

### Modèle ne se télécharge pas
```bash
# Vérifier la connexion HuggingFace
python -c "from huggingface_hub import HfApi; HfApi().whoami()"

# Télécharger manuellement
huggingface-cli download rootsautomation/GutenOCR-3B
```

## Ressources

- [GutenOCR GitHub](https://github.com/Roots-Automation/GutenOCR)
- [Mistral OCR Docs](https://docs.mistral.ai/capabilities/vision/)
- [HuggingFace GutenOCR Models](https://huggingface.co/rootsautomation)
- [ScanFactory Documentation](../../docs/)
