# Guide d'intégration OCR - ScanFactory

Ce guide explique comment intégrer les moteurs OCR GutenOCR et Mistral OCR dans vos applications.

## Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [GutenOCR](#gutenocr)
3. [Mistral OCR](#mistral-ocr)
4. [Sélection automatique](#sélection-automatique)
5. [Intégration API](#intégration-api)
6. [Bonnes pratiques](#bonnes-pratiques)

## Vue d'ensemble

ScanFactory propose deux nouveaux moteurs OCR de dernière génération :

| Moteur | Type | Forces | Coût |
|--------|------|--------|------|
| **GutenOCR** | VLM local | Manuscrits, multilangue, layouts complexes | Gratuit |
| **Mistral OCR** | API cloud | Données structurées, tables, formulaires | $2/1000 pages |

## GutenOCR

### Description

GutenOCR est un Vision Language Model (VLM) basé sur Qwen2.5-VL, optimisé pour l'OCR.

**Modèles disponibles :**
- `GutenOCR-3B` : 3 milliards de paramètres, RAM 8GB, CPU/GPU
- `GutenOCR-7B` : 7 milliards de paramètres, RAM 16GB, GPU recommandé

### Installation

```bash
pip install -r requirements/gutenocr.txt
```

### Utilisation de base

```python
from engines.gutenocr_engine import GutenOCREngine
from pathlib import Path

# Configuration
config = {
    "model_size": "3b",       # ou "7b"
    "device": "auto",         # "auto", "cuda", "cpu", "mps"
    "output_format": "TEXT",  # Voir formats ci-dessous
}

# Initialisation
engine = GutenOCREngine(config)
engine.initialize()

# Traitement
result = engine.process(Path("document.pdf"))
print(result.text)
print(f"Confiance: {result.confidence:.2%}")
```

### Formats de sortie

GutenOCR supporte 6 formats de sortie :

| Format | Description | Cas d'usage |
|--------|-------------|-------------|
| `TEXT` | Texte brut | Extraction simple |
| `TEXT2D` | Texte avec positions 2D | Préserver le layout |
| `LINES` | Ligne par ligne | Traitement séquentiel |
| `WORDS` | Mot par mot avec bboxes | Annotation, surbrillance |
| `PARAGRAPHS` | Par paragraphes | Documents structurés |
| `LATEX` | Formules en LaTeX | Documents scientifiques |

```python
from engines.gutenocr_engine import GutenOCREngine, GutenOCROutputFormat

# Format WORDS (avec bounding boxes)
config = {
    "model_size": "3b",
    "output_format": "WORDS",
}
engine = GutenOCREngine(config)
engine.initialize()

result = engine.process(Path("document.pdf"))

for block in result.blocks:
    print(f"Mot: {block['text']}, Confiance: {block['confidence']}")
    if block.get('bbox'):
        print(f"  Position: {block['bbox']}")
```

### Extraction de tableaux

```python
tables = engine.extract_tables(Path("document.pdf"))

for table in tables:
    print(f"Headers: {table['headers']}")
    for row in table['rows']:
        print(f"  Row: {row}")
```

### Batch processing

```python
from pathlib import Path

files = list(Path("documents/").glob("*.pdf"))
results = engine.batch_process(files)

for result in results:
    print(f"Texte: {result.text[:100]}...")
```

## Mistral OCR

### Description

Mistral OCR est une API commerciale de Mistral AI, excellente pour l'extraction de données structurées.

**Caractéristiques :**
- Extraction de tables automatique
- Détection de headers/footers
- Données structurées (JSON)
- Pas de GPU requis

### Installation

```bash
pip install -r requirements/mistral_ocr.txt

# Configurer la clé API
export MISTRAL_API_KEY="votre_cle_api"
```

### Utilisation de base

```python
from engines.mistral_ocr_engine import MistralOCREngine
from pathlib import Path

config = {
    "api_key": "sk-...",     # ou via MISTRAL_API_KEY
    "extract_tables": True,
    "extract_structure": True,
}

engine = MistralOCREngine(config)
engine.initialize()

result = engine.process(Path("facture.pdf"))
print(result.text)
```

### Extraction de données structurées

```python
# Extraction complète
structured = engine.extract_structured_data(Path("formulaire.pdf"))

# Tables
for table in structured["tables"]:
    print(f"Table: {table['headers']}")
    for row in table['rows']:
        print(f"  {row}")

# Headers/Footers
print(f"Headers: {structured['headers']}")
print(f"Footers: {structured['footers']}")

# Champs extraits
print(f"Champs: {structured['fields']}")
```

### Traitement par URL

```python
# Document accessible par URL
result = engine.process_document_url("https://example.com/document.pdf")
print(result.text)
```

### Suivi des coûts

```python
# Obtenir les coûts estimés
cost = engine.get_cost_estimate()
print(f"Pages traitées: {cost['pages_processed']}")
print(f"Coût estimé: ${cost['estimated_cost_usd']:.4f}")

# Réinitialiser le compteur
engine.reset_cost_tracking()
```

## Sélection automatique

La factory peut sélectionner automatiquement le meilleur moteur selon vos critères.

```python
from core.ocr_factory import OCREngineFactory, SelectionPriority, DocumentComplexity

# Sélection par priorité
engine_name = OCREngineFactory.auto_select_engine(
    priority=SelectionPriority.ACCURACY,   # SPEED, ACCURACY, COST, BALANCED
    document_type="invoice",               # manuscript, form, invoice, etc.
    complexity=DocumentComplexity.MEDIUM,  # LOW, MEDIUM, HIGH
    has_gpu=True,
)

# Créer le moteur
engine = OCREngineFactory.create_engine(engine_name, {})
```

### Logique de sélection

| Priorité | Complexité | Document type | Moteur |
|----------|------------|---------------|--------|
| COST | * | * | tesseract |
| SPEED | LOW | * | tesseract |
| SPEED | MEDIUM+ | * | gutenocr-3b |
| ACCURACY | manuscript | * | gutenocr-7b |
| ACCURACY | invoice/form | * | mistral_ocr |
| BALANCED | HIGH | * | gutenocr-7b |
| BALANCED | MEDIUM | * | gutenocr-3b |

### Comparaison de moteurs

```python
# Comparer plusieurs moteurs sur un document
comparison = OCREngineFactory.compare_engines(
    "document.pdf",
    engines=["gutenocr-3b", "gutenocr-7b", "mistral_ocr", "surya"]
)

print(f"Document: {comparison['image_path']}")
for engine_name, data in comparison["results"].items():
    if data["success"]:
        print(f"{engine_name}:")
        print(f"  Confiance: {data['confidence']:.2%}")
        print(f"  Temps: {data['processing_time_ms']}ms")
        print(f"  Blocs: {data['block_count']}")
    else:
        print(f"{engine_name}: ERREUR - {data['error']}")
```

## Intégration API

### Endpoints REST

```python
from fastapi import FastAPI, UploadFile, File, Form
from engines.gutenocr_engine import GutenOCREngine
from engines.mistral_ocr_engine import MistralOCREngine

app = FastAPI()

# Cache des moteurs
engines = {}

def get_engine(name: str):
    if name not in engines:
        if name == "gutenocr":
            engines[name] = GutenOCREngine({"model_size": "3b"})
        elif name == "mistral":
            engines[name] = MistralOCREngine({})
        engines[name].initialize()
    return engines[name]

@app.post("/api/ocr/process")
async def process_document(
    file: UploadFile = File(...),
    engine: str = Form("gutenocr"),
):
    # Sauvegarder le fichier temporairement
    import tempfile
    from pathlib import Path

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as f:
        f.write(await file.read())
        temp_path = Path(f.name)

    try:
        ocr_engine = get_engine(engine)
        result = ocr_engine.process(temp_path)

        return {
            "text": result.text,
            "confidence": result.confidence,
            "blocks": result.blocks,
            "metadata": result.metadata,
        }
    finally:
        temp_path.unlink()

@app.get("/api/ocr/engines")
async def list_engines():
    from core.ocr_factory import OCREngineFactory
    return {
        "engines": OCREngineFactory.get_available_engines(),
        "info": OCREngineFactory.get_engine_info(),
    }
```

### Client HTTP

```python
import httpx

async def process_with_api(file_path: str, engine: str = "gutenocr"):
    async with httpx.AsyncClient() as client:
        with open(file_path, "rb") as f:
            response = await client.post(
                "http://localhost:8000/api/ocr/process",
                files={"file": f},
                data={"engine": engine},
            )
        return response.json()
```

## Bonnes pratiques

### 1. Gestion de la mémoire

```python
# Nettoyer après chaque document (important pour VLM)
result = engine.process(document)
engine.cleanup()  # Libère la mémoire GPU
```

### 2. Gestion des erreurs

```python
from core.ocr_strategy import OCRResult

try:
    result = engine.process(document)
    if result.confidence < 0.5:
        # Fallback vers un autre moteur
        fallback = OCREngineFactory.create_engine("mistral_ocr", {})
        result = fallback.process(document)
except Exception as e:
    result = OCRResult(
        text="",
        confidence=0.0,
        metadata={"error": str(e)},
    )
```

### 3. Batch optimisé

```python
# Grouper par taille pour optimiser GPU
from pathlib import Path

files = list(Path("docs/").glob("*.pdf"))

# Trier par taille
files.sort(key=lambda f: f.stat().st_size)

# Traiter en batches
batch_size = 4
for i in range(0, len(files), batch_size):
    batch = files[i:i+batch_size]
    results = engine.batch_process(batch)

    # Traiter les résultats
    for result in results:
        # ...

    # Cleanup entre batches
    engine.cleanup()
```

### 4. Cache des modèles

```python
import os

# Définir le cache HuggingFace
os.environ["HF_HOME"] = "/data/models"
os.environ["TRANSFORMERS_CACHE"] = "/data/models"

# Les modèles seront téléchargés une seule fois
engine = GutenOCREngine(config)
```

### 5. Logging structuré

```python
import logging
import json

# Configuration logging JSON
class JSONFormatter(logging.Formatter):
    def format(self, record):
        return json.dumps({
            "timestamp": self.formatTime(record),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
        })

logging.basicConfig(level=logging.INFO)
logging.getLogger().handlers[0].setFormatter(JSONFormatter())
```

## Performances attendues

| Moteur | CPU (s/page) | GPU (s/page) | RAM |
|--------|--------------|--------------|-----|
| GutenOCR 3B | 3-5 | 0.5-1 | 8GB |
| GutenOCR 7B | 10-15 | 1-2 | 16GB |
| Mistral OCR | 2-3 (API) | N/A | N/A |

## Support

- **Documentation**: [README.md](../README.md)
- **Issues**: GitHub Issues
- **API Mistral**: [docs.mistral.ai](https://docs.mistral.ai)
- **GutenOCR**: [GitHub](https://github.com/Roots-Automation/GutenOCR)
