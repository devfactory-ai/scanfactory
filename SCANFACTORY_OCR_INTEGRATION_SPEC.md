# ScanFactory - Intégration Multi-OCR
## Spécifications Techniques pour Claude Code

**Version:** 2.0  
**Date:** 18 Février 2026  
**Auteur:** Yassine Techini - DevFactory  
**Objectif:** Ajouter HunyuanOCR et SuryaOCR comme options OCR configurables

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture proposée](#architecture-proposée)
3. [Modèles OCR à intégrer](#modèles-ocr-à-intégrer)
4. [Structure du projet](#structure-du-projet)
5. [Spécifications d'implémentation](#spécifications-dimplémentation)
6. [Configuration et utilisation](#configuration-et-utilisation)
7. [Migration et compatibilité](#migration-et-compatibilité)
8. [Tests et validation](#tests-et-validation)

---

## 🎯 Vue d'ensemble

### Contexte actuel
ScanFactory utilise actuellement une approche OCR basée sur Tesseract/EasyOCR. Nous souhaitons étendre les capacités avec deux nouvelles solutions state-of-the-art :

- **HunyuanOCR** : VLM end-to-end de 1B paramètres (multilingue, 90+ langues)
- **SuryaOCR** : Solution spécialisée avec détection layout avancée

### Objectifs de l'intégration
1. ✅ Permettre le choix du moteur OCR via configuration
2. ✅ Maintenir la compatibilité avec le code existant
3. ✅ Support GPU/CPU avec détection automatique
4. ✅ Batch processing optimisé
5. ✅ Export multi-format (Markdown, JSON, Docling)

---

## 🏗️ Architecture proposée

### Pattern: Strategy Pattern avec Factory

```
┌─────────────────────────────────────────────────┐
│           ScanFactory Application               │
└───────────────────┬─────────────────────────────┘
                    │
        ┌───────────▼──────────────┐
        │   OCREngineFactory       │
        │  (Sélection du moteur)   │
        └───────────┬──────────────┘
                    │
        ┌───────────┴───────────────┐
        │                           │
        ▼                           ▼
┌───────────────┐          ┌───────────────┐
│  OCRStrategy  │          │ Configuration │
│  (Interface)  │          │   Manager     │
└───────┬───────┘          └───────────────┘
        │
        ├─────────┬─────────┬─────────────┐
        │         │         │             │
        ▼         ▼         ▼             ▼
    ┌────────┐ ┌──────┐ ┌─────────┐ ┌─────────┐
    │Tesseract│ │EasyOCR│ │HunyuanOCR│ │SuryaOCR│
    └────────┘ └──────┘ └─────────┘ └─────────┘
```

---

## 🔬 Modèles OCR à intégrer

### 1. HunyuanOCR

**Caractéristiques techniques:**
- **Taille:** 1B paramètres
- **Architecture:** End-to-end VLM
  - Visual Encoder: Hunyuan-ViT (basé sur SigLIP-v2-400M)
  - Adaptive MLP Connector
  - Language Model: Hunyuan-0.5B avec XD-RoPE
- **Langues:** 90+ langues (dont RTL scripts)
- **Capacités:**
  - Détection de texte (line-level)
  - Layout analysis (tables, headers)
  - Reading order detection
  - LaTeX OCR
  - Multi-page avec cohérence logique

**Données d'entraînement:**
- 200M+ paires image-texte
- 9 scénarios réels (documents, handwriting, screenshots, etc.)
- Training pipeline en 4 étapes + GRPO reinforcement learning

**Performance:**
- OCRBench: SOTA parmi les modèles <2B
- OmniDocBench: 94.10 (vs 90.67 MinerU, 91.93 PaddleOCR-VL)

**Installation:**
```bash
# Pas de package PyPI standard mentionné
# Utiliser le repository GitHub officiel
git clone https://github.com/tencent/HunyuanOCR
pip install -r requirements.txt
```

**Usage type:**
```python
from hunyuan_ocr import HunyuanOCR

model = HunyuanOCR(
    device="cuda",  # ou "mps" ou "cpu"
    lang=["en", "fr", "ar"]  # Multi-langue
)

result = model.process(image_path, 
                       tasks=["detection", "parsing", "layout"])
markdown = result.export_to_markdown()
```

---

### 2. SuryaOCR (avec Docling)

**Caractéristiques techniques:**
- **PyPI:** `docling-surya`
- **Développeur:** Vik Paruchuri (datalab-to)
- **Langues:** 90+ langues
- **Capacités:**
  - Text detection (line-level)
  - Layout analysis (tables, images, headers)
  - Reading order detection
  - Table recognition
  - LaTeX OCR

**Architecture d'intégration avec Docling:**
```
Documents (PDF/Image)
    ↓
SuryaOCR (détection + recognition)
    ↓
Docling (orchestration + structure)
    ↓
Output (Markdown/JSON)
```

**Installation:**
```bash
pip install docling-surya
pip install docling
```

**Usage type (selon document fourni):**
```python
from docling_surya import SuryaOcrOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

pipeline_options = PdfPipelineOptions(
    do_ocr=True,
    ocr_model="suryaocr",
    allow_external_plugins=True,
    accelerator="cuda",  # Auto-detect: cuda/mps/cpu
    ocr_options=SuryaOcrOptions(lang=["en", "fr"])
)

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
        InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options)
    }
)

result = converter.convert(file_path)
markdown = result.document.export_to_markdown()
json_data = result.document.export_to_dict()
```

---

## 📁 Structure du projet

### Organisation proposée

```
scanfactory/
├── config/
│   ├── __init__.py
│   ├── ocr_config.yaml              # Configuration des moteurs OCR
│   └── settings.py                  # Chargement config
│
├── core/
│   ├── __init__.py
│   ├── ocr_strategy.py              # Interface Strategy
│   ├── ocr_factory.py               # Factory pour création moteurs
│   └── document_processor.py        # Pipeline principal
│
├── engines/
│   ├── __init__.py
│   ├── base_engine.py               # Classe abstraite
│   ├── tesseract_engine.py          # Implémentation existante
│   ├── easyocr_engine.py            # Implémentation existante
│   ├── hunyuan_engine.py            # 🆕 Nouvelle implémentation
│   └── surya_engine.py              # 🆕 Nouvelle implémentation
│
├── utils/
│   ├── __init__.py
│   ├── hardware_detector.py         # Détection GPU/CPU
│   ├── format_converter.py          # Conversions Markdown/JSON
│   └── logger.py                    # Logging centralisé
│
├── tests/
│   ├── test_hunyuan.py
│   ├── test_surya.py
│   └── test_integration.py
│
├── requirements/
│   ├── base.txt                     # Dépendances communes
│   ├── hunyuan.txt                  # Dépendances HunyuanOCR
│   ├── surya.txt                    # Dépendances SuryaOCR
│   └── gpu.txt                      # PyTorch GPU support
│
└── main.py                          # Point d'entrée application
```

---

## 💻 Spécifications d'implémentation

### 1. Configuration YAML (`config/ocr_config.yaml`)

```yaml
ocr:
  # Moteur par défaut: tesseract, easyocr, hunyuan, surya
  default_engine: "surya"
  
  # Configuration par moteur
  engines:
    tesseract:
      enabled: true
      lang: "fra+eng"
      
    easyocr:
      enabled: true
      languages: ["fr", "en"]
      gpu: true
      
    hunyuan:
      enabled: true
      device: "auto"  # auto, cuda, mps, cpu
      languages: ["en", "fr", "ar", "zh"]
      tasks:
        - detection
        - parsing
        - layout
        - reading_order
      batch_size: 32
      
    surya:
      enabled: true
      device: "auto"
      languages: ["en", "fr"]
      pipeline_options:
        do_ocr: true
        allow_external_plugins: true
      
  # Options de sortie
  output:
    formats:
      - markdown
      - json
    preserve_layout: true
    include_metadata: true
    
  # Performance
  performance:
    batch_processing: true
    max_workers: 4
    memory_cleanup: true  # Vider cache GPU après chaque doc
```

---

### 2. Interface Strategy (`core/ocr_strategy.py`)

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, List
from pathlib import Path
from dataclasses import dataclass

@dataclass
class OCRResult:
    """Résultat standardisé pour tous les moteurs OCR"""
    text: str
    confidence: float
    layout: Dict[str, Any] = None
    metadata: Dict[str, Any] = None
    
    def to_markdown(self) -> str:
        """Conversion en Markdown"""
        return self.text
    
    def to_json(self) -> Dict[str, Any]:
        """Conversion en JSON"""
        return {
            "text": self.text,
            "confidence": self.confidence,
            "layout": self.layout,
            "metadata": self.metadata
        }

class OCRStrategy(ABC):
    """Interface abstraite pour tous les moteurs OCR"""
    
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.device = self._detect_device()
        
    @abstractmethod
    def process(self, file_path: Path) -> OCRResult:
        """
        Traite un document et retourne le résultat OCR
        
        Args:
            file_path: Chemin vers le fichier (PDF/Image)
            
        Returns:
            OCRResult: Résultat structuré
        """
        pass
    
    @abstractmethod
    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Traite plusieurs documents en batch
        
        Args:
            file_paths: Liste des chemins de fichiers
            
        Returns:
            List[OCRResult]: Liste des résultats
        """
        pass
    
    @abstractmethod
    def cleanup(self):
        """Libère les ressources (GPU cache, etc.)"""
        pass
    
    def _detect_device(self) -> str:
        """Détecte le meilleur device disponible"""
        import torch
        
        if self.config.get("device") == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            return "cpu"
        return self.config.get("device", "cpu")
```

---

### 3. Implémentation HunyuanOCR (`engines/hunyuan_engine.py`)

```python
from pathlib import Path
from typing import List, Dict, Any
import torch
import gc

from core.ocr_strategy import OCRStrategy, OCRResult

class HunyuanEngine(OCRStrategy):
    """Implémentation du moteur HunyuanOCR"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._initialize_model()
    
    def _initialize_model(self):
        """Initialise le modèle HunyuanOCR"""
        from hunyuan_ocr import HunyuanOCR
        
        self.model = HunyuanOCR(
            device=self.device,
            lang=self.config.get("languages", ["en"]),
            batch_size=self.config.get("batch_size", 32)
        )
        
        print(f"✅ HunyuanOCR initialized on {self.device}")
    
    def process(self, file_path: Path) -> OCRResult:
        """
        Traite un document avec HunyuanOCR
        
        Returns:
            OCRResult avec texte, layout, et métadonnées
        """
        tasks = self.config.get("tasks", ["detection", "parsing"])
        
        # Traitement HunyuanOCR
        result = self.model.process(
            str(file_path),
            tasks=tasks
        )
        
        # Conversion au format standardisé
        return OCRResult(
            text=result.export_to_markdown(),
            confidence=result.get_confidence_score(),
            layout=result.get_layout_info(),
            metadata={
                "engine": "hunyuan",
                "device": self.device,
                "tasks": tasks,
                "page_count": result.page_count
            }
        )
    
    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Batch processing avec gestion mémoire GPU
        """
        results = []
        
        for file_path in file_paths:
            result = self.process(file_path)
            results.append(result)
            
            # Nettoyage mémoire après chaque document
            if self.config.get("memory_cleanup", True):
                self.cleanup()
        
        return results
    
    def cleanup(self):
        """Libère la mémoire GPU"""
        if self.device == "cuda":
            torch.cuda.empty_cache()
        elif self.device == "mps":
            torch.mps.empty_cache()
        gc.collect()
```

---

### 4. Implémentation SuryaOCR (`engines/surya_engine.py`)

```python
from pathlib import Path
from typing import List, Dict, Any
import torch
import gc

from docling_surya import SuryaOcrOptions
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.document_converter import DocumentConverter, PdfFormatOption

from core.ocr_strategy import OCRStrategy, OCRResult

class SuryaEngine(OCRStrategy):
    """Implémentation du moteur SuryaOCR avec Docling"""
    
    def __init__(self, config: Dict[str, Any]):
        super().__init__(config)
        self._initialize_converter()
    
    def _initialize_converter(self):
        """Initialise le DocumentConverter avec SuryaOCR"""
        
        pipeline_options = PdfPipelineOptions(
            do_ocr=self.config.get("pipeline_options", {}).get("do_ocr", True),
            ocr_model="suryaocr",
            allow_external_plugins=self.config.get("pipeline_options", {}).get("allow_external_plugins", True),
            accelerator=self.device,
            ocr_options=SuryaOcrOptions(
                lang=self.config.get("languages", ["en"])
            )
        )
        
        self.converter = DocumentConverter(
            format_options={
                InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
                InputFormat.IMAGE: PdfFormatOption(pipeline_options=pipeline_options)
            }
        )
        
        print(f"✅ SuryaOCR (Docling) initialized on {self.device}")
    
    def process(self, file_path: Path) -> OCRResult:
        """
        Traite un document avec SuryaOCR via Docling
        
        Returns:
            OCRResult avec texte markdown et structure JSON
        """
        result = self.converter.convert(str(file_path))
        
        return OCRResult(
            text=result.document.export_to_markdown(),
            confidence=0.95,  # Surya ne fournit pas de score global
            layout=result.document.export_to_dict(),
            metadata={
                "engine": "surya",
                "device": self.device,
                "page_count": len(result.document.pages) if hasattr(result.document, 'pages') else 1
            }
        )
    
    def batch_process(self, file_paths: List[Path]) -> List[OCRResult]:
        """
        Batch processing avec gestion mémoire
        """
        results = []
        
        for file_path in file_paths:
            result = self.process(file_path)
            results.append(result)
            
            # Nettoyage mémoire
            if self.config.get("memory_cleanup", True):
                self.cleanup()
        
        return results
    
    def cleanup(self):
        """Libère la mémoire GPU"""
        if self.device == "cuda":
            torch.cuda.empty_cache()
        elif self.device == "mps":
            torch.mps.empty_cache()
        gc.collect()
```

---

### 5. Factory Pattern (`core/ocr_factory.py`)

```python
from typing import Dict, Any
from core.ocr_strategy import OCRStrategy
from engines.hunyuan_engine import HunyuanEngine
from engines.surya_engine import SuryaEngine
# Import autres moteurs existants
# from engines.tesseract_engine import TesseractEngine
# from engines.easyocr_engine import EasyOCREngine

class OCREngineFactory:
    """Factory pour créer les instances de moteurs OCR"""
    
    _engines = {
        "hunyuan": HunyuanEngine,
        "surya": SuryaEngine,
        # "tesseract": TesseractEngine,
        # "easyocr": EasyOCREngine,
    }
    
    @classmethod
    def create_engine(cls, engine_name: str, config: Dict[str, Any]) -> OCRStrategy:
        """
        Crée une instance du moteur OCR demandé
        
        Args:
            engine_name: Nom du moteur (hunyuan, surya, etc.)
            config: Configuration du moteur
            
        Returns:
            Instance de OCRStrategy
            
        Raises:
            ValueError: Si le moteur n'existe pas ou n'est pas activé
        """
        if engine_name not in cls._engines:
            raise ValueError(
                f"Moteur '{engine_name}' inconnu. "
                f"Moteurs disponibles: {list(cls._engines.keys())}"
            )
        
        if not config.get("enabled", False):
            raise ValueError(f"Moteur '{engine_name}' désactivé dans la configuration")
        
        engine_class = cls._engines[engine_name]
        return engine_class(config)
    
    @classmethod
    def register_engine(cls, name: str, engine_class: type):
        """Permet d'enregistrer de nouveaux moteurs dynamiquement"""
        cls._engines[name] = engine_class
```

---

### 6. Pipeline principal (`core/document_processor.py`)

```python
from pathlib import Path
from typing import List, Dict, Any
import yaml
from datetime import datetime

from core.ocr_factory import OCREngineFactory
from core.ocr_strategy import OCRResult

class DocumentProcessor:
    """Pipeline principal pour le traitement de documents"""
    
    def __init__(self, config_path: str = "config/ocr_config.yaml"):
        """
        Initialise le processeur avec la configuration
        
        Args:
            config_path: Chemin vers le fichier de configuration
        """
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)
        
        self.default_engine = self.config['ocr']['default_engine']
        self.output_dir = Path(self.config['ocr'].get('output_dir', './output'))
        self.output_dir.mkdir(parents=True, exist_ok=True)
    
    def process_document(
        self, 
        file_path: Path, 
        engine_name: str = None,
        output_formats: List[str] = None
    ) -> Dict[str, Any]:
        """
        Traite un document avec le moteur spécifié
        
        Args:
            file_path: Chemin vers le document
            engine_name: Nom du moteur (None = utiliser default)
            output_formats: Formats de sortie (markdown, json)
            
        Returns:
            Dict avec chemins des fichiers générés et métadonnées
        """
        # Sélection du moteur
        engine_name = engine_name or self.default_engine
        engine_config = self.config['ocr']['engines'][engine_name]
        
        # Création du moteur via Factory
        engine = OCREngineFactory.create_engine(engine_name, engine_config)
        
        # Traitement
        print(f"🔄 Processing {file_path.name} with {engine_name}...")
        result = engine.process(file_path)
        
        # Sauvegarde des résultats
        output_formats = output_formats or self.config['ocr']['output']['formats']
        outputs = self._save_results(file_path, result, output_formats)
        
        # Nettoyage
        engine.cleanup()
        
        return {
            "success": True,
            "engine": engine_name,
            "input_file": str(file_path),
            "outputs": outputs,
            "metadata": result.metadata
        }
    
    def batch_process(
        self, 
        input_dir: Path, 
        engine_name: str = None,
        recursive: bool = True
    ) -> List[Dict[str, Any]]:
        """
        Traite tous les documents d'un répertoire
        
        Args:
            input_dir: Répertoire contenant les documents
            engine_name: Nom du moteur à utiliser
            recursive: Parcourir les sous-dossiers
            
        Returns:
            Liste des résultats de traitement
        """
        supported_extensions = {".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"}
        
        if recursive:
            files = [f for f in input_dir.rglob("*") if f.suffix.lower() in supported_extensions]
        else:
            files = [f for f in input_dir.glob("*") if f.suffix.lower() in supported_extensions]
        
        results = []
        for file_path in files:
            try:
                result = self.process_document(file_path, engine_name)
                results.append(result)
            except Exception as e:
                results.append({
                    "success": False,
                    "input_file": str(file_path),
                    "error": str(e)
                })
        
        return results
    
    def _save_results(
        self, 
        input_path: Path, 
        result: OCRResult, 
        formats: List[str]
    ) -> Dict[str, str]:
        """
        Sauvegarde les résultats dans les formats demandés
        
        Returns:
            Dict avec chemins des fichiers créés
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{input_path.stem}_{timestamp}"
        outputs = {}
        
        if "markdown" in formats:
            md_path = self.output_dir / f"{base_name}.md"
            with open(md_path, "w", encoding="utf-8") as f:
                f.write(result.to_markdown())
            outputs["markdown"] = str(md_path)
        
        if "json" in formats:
            import json
            json_path = self.output_dir / f"{base_name}.json"
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(result.to_json(), f, indent=2, ensure_ascii=False)
            outputs["json"] = str(json_path)
        
        return outputs
```

---

### 7. Point d'entrée (`main.py`)

```python
#!/usr/bin/env python3
from pathlib import Path
import argparse
from core.document_processor import DocumentProcessor

def main():
    parser = argparse.ArgumentParser(description="ScanFactory Multi-OCR Processor")
    
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Fichier ou répertoire à traiter"
    )
    
    parser.add_argument(
        "--engine",
        choices=["tesseract", "easyocr", "hunyuan", "surya"],
        help="Moteur OCR à utiliser (défaut: config)"
    )
    
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("./output"),
        help="Répertoire de sortie"
    )
    
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Mode batch pour traiter tout un répertoire"
    )
    
    parser.add_argument(
        "--formats",
        nargs="+",
        choices=["markdown", "json"],
        default=["markdown"],
        help="Formats de sortie"
    )
    
    args = parser.parse_args()
    
    # Initialisation du processeur
    processor = DocumentProcessor()
    processor.output_dir = args.output_dir
    
    # Traitement
    if args.batch:
        results = processor.batch_process(args.input, engine_name=args.engine)
        
        # Affichage résumé
        successes = sum(1 for r in results if r.get("success"))
        print(f"\n📊 Résumé: {successes}/{len(results)} documents traités avec succès")
    else:
        result = processor.process_document(
            args.input, 
            engine_name=args.engine,
            output_formats=args.formats
        )
        
        if result["success"]:
            print(f"\n✅ Document traité avec succès!")
            print(f"📁 Fichiers générés:")
            for fmt, path in result["outputs"].items():
                print(f"   - {fmt}: {path}")

if __name__ == "__main__":
    main()
```

---

## 📦 Fichiers de dépendances

### `requirements/base.txt`
```
pyyaml>=6.0
pathlib>=1.0
tqdm>=4.65.0
```

### `requirements/hunyuan.txt`
```
torch>=2.2.0
torchvision>=0.17.0
# Installation depuis GitHub (à adapter selon release officielle)
# git+https://github.com/tencent/HunyuanOCR.git
```

### `requirements/surya.txt`
```
docling>=2.0.0
docling-surya>=1.0.0
torch>=2.2.0
```

### `requirements/gpu.txt` (NVIDIA)
```
--extra-index-url https://download.pytorch.org/whl/cu121
torch>=2.2.0
torchvision>=0.17.0
```

---

## 🚀 Configuration et utilisation

### Installation

```bash
# 1. Environnement virtuel
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Dépendances de base
pip install -r requirements/base.txt

# 3. Moteur HunyuanOCR
pip install -r requirements/hunyuan.txt

# 4. Moteur SuryaOCR
pip install -r requirements/surya.txt

# 5. Support GPU (optionnel)
pip install -r requirements/gpu.txt
```

### Exemples d'utilisation

#### 1. Document unique avec SuryaOCR
```bash
python main.py \
  --input ./docs/sample.pdf \
  --engine surya \
  --formats markdown json
```

#### 2. Batch processing avec HunyuanOCR
```bash
python main.py \
  --input ./docs/ \
  --engine hunyuan \
  --batch \
  --output-dir ./results
```

#### 3. Utilisation du moteur par défaut (config)
```bash
python main.py --input ./docs/invoice.pdf
```

#### 4. Usage programmatique

```python
from pathlib import Path
from core.document_processor import DocumentProcessor

# Initialisation
processor = DocumentProcessor(config_path="config/ocr_config.yaml")

# Traitement avec SuryaOCR
result = processor.process_document(
    file_path=Path("./docs/contract.pdf"),
    engine_name="surya",
    output_formats=["markdown", "json"]
)

print(f"Markdown: {result['outputs']['markdown']}")
print(f"JSON: {result['outputs']['json']}")

# Batch avec HunyuanOCR
results = processor.batch_process(
    input_dir=Path("./docs/invoices/"),
    engine_name="hunyuan"
)
```

---

## 🔄 Migration et compatibilité

### Migration depuis version actuelle

**Étape 1:** Sauvegarder configuration actuelle
```bash
cp config/current_config.yaml config/current_config.yaml.backup
```

**Étape 2:** Adapter le code existant

Si vous avez du code utilisant directement Tesseract/EasyOCR:

**AVANT:**
```python
import pytesseract
result = pytesseract.image_to_string(image)
```

**APRÈS:**
```python
from core.document_processor import DocumentProcessor

processor = DocumentProcessor()
result = processor.process_document(
    file_path=Path("image.png"),
    engine_name="tesseract"  # ou "surya", "hunyuan"
)
text = result['outputs']['markdown']
```

**Étape 3:** Tests de régression

Exécuter les tests sur documents de référence pour valider que les anciens moteurs fonctionnent toujours.

---

## ✅ Tests et validation

### Tests unitaires (`tests/test_surya.py`)

```python
import unittest
from pathlib import Path
from core.document_processor import DocumentProcessor

class TestSuryaEngine(unittest.TestCase):
    
    def setUp(self):
        self.processor = DocumentProcessor()
        self.test_file = Path("tests/fixtures/sample.pdf")
    
    def test_surya_single_document(self):
        """Test traitement d'un document avec SuryaOCR"""
        result = self.processor.process_document(
            self.test_file,
            engine_name="surya"
        )
        
        self.assertTrue(result["success"])
        self.assertEqual(result["engine"], "surya")
        self.assertIn("markdown", result["outputs"])
    
    def test_surya_multilingual(self):
        """Test support multilingue"""
        # À implémenter avec documents FR/EN/AR
        pass
    
    def test_surya_gpu_detection(self):
        """Test détection GPU automatique"""
        from engines.surya_engine import SuryaEngine
        import torch
        
        engine = SuryaEngine({"device": "auto", "languages": ["en"]})
        
        if torch.cuda.is_available():
            self.assertEqual(engine.device, "cuda")
        elif torch.backends.mps.is_available():
            self.assertEqual(engine.device, "mps")
        else:
            self.assertEqual(engine.device, "cpu")

if __name__ == "__main__":
    unittest.main()
```

### Tests d'intégration

```python
# tests/test_integration.py

def test_engine_switching():
    """Test changement de moteur à la volée"""
    processor = DocumentProcessor()
    
    # Test avec chaque moteur
    for engine in ["tesseract", "surya", "hunyuan"]:
        result = processor.process_document(
            Path("tests/fixtures/sample.pdf"),
            engine_name=engine
        )
        assert result["success"]
        assert result["engine"] == engine
```

---

## 📊 Comparaison des performances attendues

| Critère | Tesseract | EasyOCR | SuryaOCR | HunyuanOCR |
|---------|-----------|---------|----------|------------|
| **Vitesse (CPU)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| **Vitesse (GPU)** | N/A | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Précision texte simple** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Layout complexe** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Multilingue** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Tables** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **LaTeX/Formules** | ❌ | ❌ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Handwriting** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Taille modèle** | ~10MB | ~100MB | ~500MB | ~1GB |

---

## 🎯 Recommandations d'usage

### Choisir le bon moteur selon le cas d'usage

**Tesseract:** 
- ✅ Documents scannés simples, monolingues
- ✅ Contraintes de ressources (CPU only, faible RAM)
- ❌ Layout complexe, tables

**EasyOCR:**
- ✅ Texte dans images naturelles (photos, panneaux)
- ✅ Multilingual avec scripts variés
- ❌ Documents structurés, tables

**SuryaOCR (+ Docling):**
- ✅ **Recommandé pour PDF professionnels**
- ✅ Documents avec tables, headers, layouts complexes
- ✅ RAG pipelines (export Markdown structuré)
- ✅ GPU disponible

**HunyuanOCR:**
- ✅ **Meilleur choix pour production multi-format**
- ✅ Documents multilingues (90+ langues)
- ✅ Formules mathématiques (LaTeX)
- ✅ Handwriting + Print mélangés
- ⚠️ Nécessite GPU pour performances optimales

---

## 📝 Checklist d'implémentation pour Claude Code

### Phase 1: Structure et configuration
- [ ] Créer l'arborescence de dossiers
- [ ] Implémenter `config/ocr_config.yaml`
- [ ] Créer `core/ocr_strategy.py` (interface abstraite)
- [ ] Créer `core/ocr_factory.py` (Factory pattern)

### Phase 2: Moteurs OCR
- [ ] Implémenter `engines/base_engine.py`
- [ ] Implémenter `engines/surya_engine.py`
- [ ] Implémenter `engines/hunyuan_engine.py`
- [ ] Adapter moteurs existants (Tesseract/EasyOCR) à la nouvelle interface

### Phase 3: Pipeline et utils
- [ ] Implémenter `core/document_processor.py`
- [ ] Créer `utils/hardware_detector.py`
- [ ] Créer `utils/format_converter.py`
- [ ] Créer `main.py` avec CLI

### Phase 4: Tests
- [ ] Tests unitaires pour chaque moteur
- [ ] Tests d'intégration
- [ ] Tests de performance (benchmarking)
- [ ] Validation sur documents réels

### Phase 5: Documentation et déploiement
- [ ] README avec exemples d'utilisation
- [ ] Documentation API (docstrings)
- [ ] Guide de migration
- [ ] Scripts de déploiement Docker (optionnel)

---

## 🐳 Bonus: Déploiement Docker

### `Dockerfile`

```dockerfile
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Installation Python et dépendances système
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    libgl1-mesa-glx \
    libglib2.0-0 \
    tesseract-ocr \
    tesseract-ocr-fra \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Installation dépendances Python
COPY requirements/ ./requirements/
RUN pip3 install --no-cache-dir \
    -r requirements/base.txt \
    -r requirements/surya.txt \
    -r requirements/hunyuan.txt \
    -r requirements/gpu.txt

# Copie du code
COPY . .

# Volumes pour input/output
VOLUME ["/app/input", "/app/output"]

# Commande par défaut
ENTRYPOINT ["python3", "main.py"]
CMD ["--input", "/app/input", "--batch", "--output-dir", "/app/output"]
```

### Utilisation

```bash
# Build
docker build -t scanfactory:latest .

# Run avec GPU
docker run --gpus all \
  -v $(pwd)/input:/app/input \
  -v $(pwd)/output:/app/output \
  scanfactory:latest --engine surya
```

---

## 🔗 Ressources et références

### Documentation officielle
- **HunyuanOCR:** https://github.com/tencent/HunyuanOCR (à vérifier)
- **SuryaOCR:** https://github.com/datalab-to/surya
- **Docling:** https://github.com/docling-project/docling
- **PyPI Surya:** https://pypi.org/project/surya-ocr/

### Articles de référence
- HunyuanOCR Technical Report (février 2026)
- "Using SuryaOCR with Docling" - Alain Airom

### Benchmarks
- OCRBench: https://ocrbench.com
- OmniDocBench: https://omnidocbench.github.io

---

## ✨ Conclusion

Cette spécification fournit une architecture complète et modulaire pour intégrer HunyuanOCR et SuryaOCR dans ScanFactory. 

**Points clés:**
✅ **Extensibilité:** Ajout facile de nouveaux moteurs via le pattern Strategy  
✅ **Configuration:** Sélection du moteur via YAML sans modification de code  
✅ **Performance:** Support GPU automatique avec gestion mémoire  
✅ **Compatibilité:** Maintien des moteurs existants  
✅ **Production-ready:** Logging, error handling, batch processing  

**Prochaines étapes:**
1. Valider l'architecture avec l'équipe
2. Prioriser Phase 1 et 2 pour MVP
3. Tests sur corpus de documents réels
4. Optimisation performances GPU
5. Déploiement production avec monitoring

---

**Document préparé pour:** Claude Code  
**Projet:** ScanFactory v2.0 - Multi-OCR Integration  
**Contact:** Yassine Techini - DevFactory  
**Date:** 18 Février 2026
